const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'lorenayumega@gmail.com',
    pass: 'ombh kktl ovtw ljtd'
  },
  tls: { ciphers: 'SSLv3' }
});

transporter.sendMail({
  from: '"Sistema Cancha" <lorenayumega@gmail.com>',
  to: 'santosqamasa@gmail.com',  // Cambia por tu correo de prueba
  subject: 'Prueba de correo Hotmail',
  text: '¡Esto es una prueba desde Hotmail!',
  html: '<h1>¡Funciona!</h1>'
}).then(() => {
  console.log('Correo enviado');
}).catch(err => {
  console.error('Error:', err);
});