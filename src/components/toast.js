export class Toast {
  static show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Icon based on type
    let icon = '';
    switch(type) {
      case 'success': icon = '✓'; break;
      case 'error': icon = '✕'; break;
      case 'warning': icon = '⚠'; break;
      case 'info': default: icon = 'ℹ'; break;
    }

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    const removeToast = () => {
      if (toast.dataset.closing) return;
      toast.dataset.closing = "true";
      
      const anim = toast.animate([
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: 'translateX(30px)' }
      ], {
        duration: 300,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'forwards'
      });
      
      anim.onfinish = () => {
        if (container.contains(toast)) {
          container.removeChild(toast);
        }
      };
    };

    toast.addEventListener('click', () => {
      toast.style.cursor = 'default';
      removeToast();
    });

    toast.style.cursor = 'pointer';

    setTimeout(removeToast, duration);
  }
}
