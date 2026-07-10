import * as THREE from 'three';

export class IconRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.mesh = null;
    this.animationId = null;
    this.clock = new THREE.Clock();
    this.mixer = null;
  }

  init() {
    if (this.renderer) return;

    this.scene = new THREE.Scene();
    // Transparent background
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
    this.camera.position.z = 2.5;
    this.camera.position.y = 0.5;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 2, 3);
    this.scene.add(dirLight);

    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  loadIcon(parsedIcon) {
    this.init();
    this.clear();

    const { shapes, textureData } = parsedIcon;
    if (!shapes || shapes.length === 0) return;

    // Create Texture
    const texture = new THREE.DataTexture(textureData, 128, 128, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;

    // Base geometry from the first shape
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(shapes[0].vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(shapes[0].normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(shapes[0].uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(shapes[0].colors, 4, true));

    // Morph targets for animation
    if (shapes.length > 1) {
      geometry.morphAttributes.position = [];
      geometry.morphAttributes.normal = [];
      
      for (let i = 1; i < shapes.length; i++) {
        geometry.morphAttributes.position.push(new THREE.BufferAttribute(shapes[i].vertices, 3));
        geometry.morphAttributes.normal.push(new THREE.BufferAttribute(shapes[i].normals, 3));
      }
    }

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
      wireframe: false // can be set to true if triangles look messed up due to stripping
    });

    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere || { center: new THREE.Vector3(), radius: 1 };

    this.mesh = new THREE.Mesh(geometry, material);
    
    // Center the mesh relative to its parent group
    this.mesh.position.set(-sphere.center.x, -sphere.center.y, -sphere.center.z);
    
    this.modelGroup = new THREE.Group();
    this.modelGroup.add(this.mesh);

    // Scale the group to fit a unit radius
    if (sphere.radius > 0) {
      const scale = 1.0 / sphere.radius;
      this.modelGroup.scale.set(scale, scale, scale);
    }
    
    this.scene.add(this.modelGroup);

    // Setup animation
    if (shapes.length > 1) {
      this.mixer = new THREE.AnimationMixer(this.mesh);
      
      // Create a clip that loops through all morph targets
      const tracks = [];
      const times = [];
      const values = [];
      
      // We have shapes.length total frames.
      const fps = 15;
      const duration = shapes.length / fps;
      
      for (let i = 0; i < shapes.length; i++) {
        times.push(i / fps);
      }
      
      // Morph target influences array over time
      for (let targetIndex = 0; targetIndex < shapes.length - 1; targetIndex++) {
        const influenceValues = [];
        for (let frame = 0; frame < shapes.length; frame++) {
          // 1 if this is the active frame (targetIndex + 1), else 0
          influenceValues.push((frame === targetIndex + 1) ? 1 : 0);
        }
        tracks.push(new THREE.NumberKeyframeTrack(`.morphTargetInfluences[${targetIndex}]`, times, influenceValues));
      }
      
      const clip = new THREE.AnimationClip('Action', duration, tracks);
      const action = this.mixer.clipAction(clip);
      action.play();
    }

    this.startLoop();
  }

  startLoop() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      const delta = this.clock.getDelta();
      
      if (this.mixer) {
        this.mixer.update(delta);
      }
      
      if (this.modelGroup) {
        // Spin slowly
        this.modelGroup.rotation.y -= delta * 0.5;
      }
      
      this.renderer.render(this.scene, this.camera);
    };
    
    animate();
  }

  clear() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.modelGroup) {
      this.scene.remove(this.modelGroup);
      this.modelGroup = null;
    }
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
  }
}
