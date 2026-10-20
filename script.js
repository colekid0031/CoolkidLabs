(() => {
  const button = document.getElementById('ckl-reload-control');
  if (!button) return;
  let reloading = false;
  button.addEventListener('click', () => {
    if (reloading) return;
    reloading = true;
    button.classList.add('ckl-spinning');
    button.setAttribute('aria-label', 'Reloading page');
    button.querySelector('.ckl-reload-tip').textContent = 'Reloading…';
    window.setTimeout(() => window.location.reload(), 1000);
  });
})();