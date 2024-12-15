const Queue = require('bull');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const pdfQueue = new Queue('pdf-generation', REDIS_URL);

pdfQueue.process(async (job) => {
  const { fullName } = job.data;
  
  try {
    const templatePath = path.join(__dirname, '..', 'templates', 'template.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');
    htmlContent = htmlContent.replace('{{name}}', fullName || '');
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const page = await browser.newPage();
    await page.setViewport({
      width: 1200,
      height: 800,
      deviceScaleFactor: 1,
    });

    await page.setContent(htmlContent, { 
      waitUntil: ['networkidle0', 'domcontentloaded'] 
    });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      landscape: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    await browser.close();
    
    return { pdfBuffer };
  } catch (error) {
    console.error('Error in PDF generation:', error);
    throw error;
  }
});

console.log('PDF worker is running'); 