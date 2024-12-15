const request = require('supertest');
const app = require('../app'); // You'll need to export your app from app.js

describe('PDF Generation Tests', () => {
  test('Should generate PDF with valid name', async () => {
    const response = await request(app)
      .post('/generate-pdf')
      .send('fullName=Test User')
      .expect(200);
    
    expect(response.headers['content-type']).toBe('application/pdf');
  });

  test('Should serve fallback PDF with invalid input', async () => {
    const response = await request(app)
      .post('/generate-pdf')
      .send('fullName=')
      .expect(200);
    
    expect(response.headers['content-type']).toBe('application/pdf');
  });
}); 