/**
 * useThreeRenderer — custom Preact hook for Three.js lifecycle management.
 * Creates scene, camera, renderer, and animation loop.
 * Properly cleans up all resources on unmount (fixes the resize listener leak).
 */

import { useRef, useEffect } from 'preact/hooks';
import * as THREE from 'three';
import { type ParsedIcon } from '../domain/types';

export interface ThreeRendererOptions {
  icon: ParsedIcon | null;
}

export const useThreeRenderer = ({ icon }: ThreeRendererOptions) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !icon || icon.shapes.length === 0) return;

    // ── Scene setup ──────────────────────────────────────────────────────────
    const scene    = new THREE.Scene();
    const width    = container.clientWidth  || 200;
    const height   = container.clientHeight || 200;
    const camera   = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // ── Lighting ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(1, 2, 3);
    scene.add(dirLight);

    // ── Geometry ─────────────────────────────────────────────────────────────
    const baseShape = icon.shapes[0];
    if (baseShape === undefined) return;

    const vertexCount = baseShape.vertices.length;
    const positions   = new Float32Array(vertexCount * 3);
    const normals     = new Float32Array(vertexCount * 3);
    const uvs         = new Float32Array(vertexCount * 2);
    const colors      = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const v = baseShape.vertices[i];
      if (v === undefined) continue;
      positions[i * 3]     = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      normals[i * 3]       = v.nx;
      normals[i * 3 + 1]   = v.ny;
      normals[i * 3 + 2]   = v.nz;
      uvs[i * 2]           = v.u;
      uvs[i * 2 + 1]       = v.v;
      colors[i * 3]        = v.r / 255;
      colors[i * 3 + 1]    = v.g / 255;
      colors[i * 3 + 2]    = v.b / 255;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal',   new THREE.BufferAttribute(normals,   3));
    geometry.setAttribute('uv',       new THREE.BufferAttribute(uvs,       2));
    geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    // ── Center geometry so the model isn't clipped ───────────────────────────
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const offsetX = -(bbox.min.x + bbox.max.x) / 2;
    const offsetY = -(bbox.min.y + bbox.max.y) / 2;
    const offsetZ = -(bbox.min.z + bbox.max.z) / 2;
    geometry.center();

    // ── Morph targets (animation shapes) ─────────────────────────────────────
    let mixer: THREE.AnimationMixer | null = null;

    if (icon.shapes.length > 1) {
      for (let s = 1; s < icon.shapes.length; s++) {
        const shape = icon.shapes[s];
        if (shape === undefined) continue;
        const morphPos = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
          const v = shape.vertices[i];
          if (v === undefined) continue;
          morphPos[i * 3]     = v.x + offsetX;
          morphPos[i * 3 + 1] = v.y + offsetY;
          morphPos[i * 3 + 2] = v.z + offsetZ;
        }
        geometry.morphAttributes['position'] ??= [];
        geometry.morphAttributes['position'].push(new THREE.BufferAttribute(morphPos, 3));
      }
    }

    // ── Texture ───────────────────────────────────────────────────────────────
    const texture = new THREE.DataTexture(
      icon.textureData,
      128,
      128,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    // ── Material & Mesh ───────────────────────────────────────────────────────
    const material = new THREE.MeshPhongMaterial({
      map:           texture,
      vertexColors:  true,
      side:          THREE.DoubleSide,
      transparent:   true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // ── Animation ─────────────────────────────────────────────────────────────
    if (icon.shapes.length > 1) {
      mixer = new THREE.AnimationMixer(mesh);
      const times   = Array.from({ length: icon.shapes.length }, (_, i) => i / 15);
      const values: number[] = [];
      for (let s = 0; s < icon.shapes.length - 1; s++) {
        const influence = new Array<number>(icon.shapes.length - 1).fill(0);
        influence[s] = 1;
        values.push(...influence);
      }
      const track = new THREE.NumberKeyframeTrack(
        '.morphTargetInfluences',
        times,
        values,
      );
      const clip   = new THREE.AnimationClip('morph', -1, [track]);
      const action = mixer.clipAction(clip);
      action.play();
    }

    // ── Resize handler — attached to container, NOT window ────────────────────
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth  || 200;
      const h = container.clientHeight || 200;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // ── Animation loop ────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let animId: number;

    const animate = (): void => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer?.update(delta);
      mesh.rotation.y -= 0.5 * delta;
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      mixer?.stopAllAction();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [icon]);

  return { containerRef };
};
