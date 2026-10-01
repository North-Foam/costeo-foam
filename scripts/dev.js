import app from '../server/app.js';
if (!process.env.APP_ORIGIN) process.env.APP_ORIGIN = 'http://localhost:3100';
const port = Number(process.env.PORT || 3100);
app.listen(port, '127.0.0.1', () => console.log(`North Foam local: http://localhost:${port}`));
