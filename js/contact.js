/* The email address is stored reversed and split, then assembled in the browser.
   Bots that scrape raw HTML for email addresses find nothing usable.
   Usage: <a data-contact="email"> and <span data-contact-text="email"> */
(function () {
  var r = function (s) { return s.split('').reverse().join(''); };
  var email = r('71ktcgardnac') + String.fromCharCode(64) + r('moc.liamg');
  document.querySelectorAll('[data-contact="email"]').forEach(function (a) {
    a.setAttribute('href', 'mailto:' + email);
  });
  document.querySelectorAll('[data-contact-text="email"]').forEach(function (el) {
    el.textContent = email;
  });
})();
