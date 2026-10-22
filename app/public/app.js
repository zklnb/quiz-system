// Xác nhận trước khi thực hiện thao tác nguy hiểm (CSP không cho phép onclick inline)
document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-confirm]');
  if (el && !window.confirm(el.getAttribute('data-confirm'))) e.preventDefault();
});
