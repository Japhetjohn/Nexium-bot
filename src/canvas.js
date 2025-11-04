// canvas.js
(function() {
  const canvas = document.getElementById('backgroundCanvas');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get 2D context for canvas');
    return;
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const particleCount = 50;

  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 3 + 1;
      this.speedX = Math.random() * 0.5 - 0.25;
      this.speedY = Math.random() * 0.5 - 0.25;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
      if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }
    draw() {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.5)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  animate();

  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-menu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', (event) => {
      event.stopPropagation();
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('active');
      if (navMenu.classList.contains('active')) {
        navMenu.classList.remove('hidden');
      } else {
        navMenu.classList.add('hidden');
      }
    });

    document.addEventListener('click', (event) => {
      if (!navMenu.contains(event.target) && !hamburger.contains(event.target)) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
        navMenu.classList.add('hidden');
      }
    });
  } else {
    console.error('Hamburger or nav-menu elements not found');
  }
})();