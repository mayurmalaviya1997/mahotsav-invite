const express = require("express");
const path = require("path");
const fs = require("fs");
const { Cluster } = require("puppeteer-cluster");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;

let cluster;
let clusterReady = false; // Flag to track cluster readiness

// Track total requests, successful, and failed requests
let totalRequests = 0;
let totalSuccessful = 0;
let totalFailed = 0;
let pendingRequests = 0;

// Middleware to track requests
app.use((req, res, next) => {
  totalRequests++;
  pendingRequests++;
  res.on('finish', () => {
    pendingRequests--;
    if (res.statusCode === 200) {
      totalSuccessful++;
    } else {
      totalFailed++;
    }
    console.log(`Total Requests: ${totalRequests}, Successful: ${totalSuccessful}, Failed: ${totalFailed}, Pending: ${pendingRequests}`);
  });
  next();
});

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

// New route for direct PDF download
app.get("/download-static-pdf", (req, res) => {
  const staticPdfPath = path.join(__dirname, "static", "fallback.pdf");
  res.download(staticPdfPath, "invitation.pdf", (err) => {
    if (err) {
      console.error("Error downloading static PDF:", err);
      res.status(500).send("Error downloading PDF");
    }
  });
});

// Initialize the Puppeteer cluster
const startCluster = async () => {
  try {
    console.log("Starting Puppeteer Cluster...");
    cluster = await Cluster.launch({
      concurrency: Cluster.CONCURRENCY_PAGE,
      maxConcurrency: os.cpus().length, // Set max concurrency based on the number of CPU cores
      puppeteerOptions: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-accelerated-2d-canvas',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      },
      timeout: 30000, // Timeout for each task (in ms)
    });

    clusterReady = true; // Flag to indicate cluster is ready

    cluster.task(async ({ page, data }) => {
      const { fullName } = data;

      try {
        const templatePath = path.join(__dirname, "templates", "template.html");
        let htmlContent = fs.readFileSync(templatePath, "utf-8");

        if (fullName) htmlContent = htmlContent.replace("{{name}}", fullName || "");

        await page.setContent(htmlContent, { waitUntil: "load" });

        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          landscape: true,
          margin: {
            top: '0px',
            left: '0px',
            right: '0px',
            bottom: '0px'
          }
        });

        return pdfBuffer;
      } catch (error) {
        console.error("Error generating PDF:", error);
        throw error; // Throw error to indicate task failure
      }
    });

    cluster.on('taskerror', (err, data) => {
      console.log(`Error in task with data: ${JSON.stringify(data)}, Error: ${err.message}`);
    });

    console.log("Puppeteer Cluster is ready for tasks.");
  } catch (err) {
    console.error("Error starting cluster:", err);
  }
};

// Task for generating PDFs
app.post("/generate-pdf", async (req, res) => {
  console.time("PDF Generation Time"); // Start timing PDF generation

  if (!clusterReady) {
    console.error("Cluster is not ready yet.");
    return res.status(500).send("Cluster is not ready, try again later.");
  }

  const { fullName } = req.body;
  try {
    // Send task to cluster to generate PDF
    console.log(`Starting PDF generation for: ${fullName}`);
    const pdfBuffer = await cluster.execute({ fullName });

    // Send PDF buffer to the client
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=generated.pdf");
    res.end(pdfBuffer);

    console.timeEnd("PDF Generation Time"); // End timing PDF generation after the PDF is sent
  } catch (error) {
    console.error("Error generating PDF:", error);
    totalFailed++;
    res.download(
      path.join(__dirname, "static", "fallback.pdf"),
      "invitation.pdf",
      (err) => {
        if (err) {
          console.error("Error serving fallback PDF:", err);
          res.status(500).send("An error occurred while generating the PDF.");
        }
      }
    );
    res.status(500).send("An error occurred while generating the PDF.");
    console.timeEnd("PDF Generation Time"); // End timing even if there's an error
  }
});

// Start the server and cluster
startCluster().then(() => {
  // Start Express server
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
});
