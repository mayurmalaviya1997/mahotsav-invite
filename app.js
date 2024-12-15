const express = require("express");
const path = require("path");
const puppeteer = require("puppeteer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // Serve static files like CSS

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files from the "public" directory
app.use("/public", express.static(path.join(__dirname, "public")));

// Route to render the form
app.get("/", (req, res) => {
  res.render("form"); // Render the form.ejs file
});

app.post("/generate-pdf", async (req, res) => {
  const { fullName } = req.body;


  try {
    const templatePath = path.join(__dirname, "templates", "template.html");
    let htmlContent = fs.readFileSync(templatePath, "utf-8");

    if(fullName) htmlContent = htmlContent.replace("{{name}}", fullName || "");

    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      // margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
      landscape: true,
    });

    await browser.close();

    // Send PDF buffer to the client
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=generated.pdf");
    res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("An error occurred while generating the PDF.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
