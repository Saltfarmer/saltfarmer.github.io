/* Contact details are stored reversed and split, then assembled in the browser.
   Bots that scrape raw HTML for emails/phone numbers find nothing usable.
   Usage: <a data-contact="email|whatsapp|phone"> and <span data-contact-text="email|phone"> */
(function () {
  var r = function (s) { return s.split('').reverse().join(''); };
  var user = r('71ktcgardnac'), host = r('moc.liamg'), num = r('5993934569826');
  var email = user + String.fromCharCode(64) + host;
  var links = {
    email: 'mailto:' + email,
    whatsapp: 'https://wa.me/' + num,
    phone: 'tel:+' + num
  };
  var texts = { email: email, phone: '+' + num };
  document.querySelectorAll('[data-contact]').forEach(function (a) {
    var k = a.getAttribute('data-contact');
    if (links[k]) a.setAttribute('href', links[k]);
  });
  document.querySelectorAll('[data-contact-text]').forEach(function (el) {
    var k = el.getAttribute('data-contact-text');
    if (texts[k]) el.textContent = texts[k];
  });
})();
