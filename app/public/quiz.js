// Đếm ngược thời gian làm bài, tự động nộp khi hết giờ
(function () {
  var timer = document.getElementById('timer');
  var form = document.getElementById('quiz-form');
  if (!timer || !form) return;
  var progress = document.getElementById('quiz-progress');
  var answeredCount = document.getElementById('answered-count');
  var total = progress ? parseInt(progress.getAttribute('data-total'), 10) : 0;
  function updateProgress() {
    if (!progress || !answeredCount || !total) return;
    var answered = new Set(Array.from(form.querySelectorAll('input[type="radio"]:checked'), function (input) {
      return input.name;
    })).size;
    answeredCount.textContent = answered + ' / ' + total + ' câu đã trả lời';
    progress.value = answered;
  }
  form.addEventListener('change', updateProgress);
  updateProgress();
  var left = parseInt(timer.getAttribute('data-seconds'), 10);
  var span = document.getElementById('time-left');
  function render() {
    var m = Math.floor(left / 60), s = left % 60;
    span.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    if (left <= 60) timer.classList.add('danger');
  }
  render();
  var id = setInterval(function () {
    left--; render();
    if (left <= 0) { clearInterval(id); form.setAttribute('data-auto', '1'); form.submit(); }
  }, 1000);
})();
