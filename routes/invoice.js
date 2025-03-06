import express from "express";
import { createInvoice } from "./Controller/invoiceController.js";
import fs from "fs";
import path from "path";
import Booking from "../Model/bookingModel.js";
import cors from "cors"; 

const router = express.Router();

// Enable CORS
router.use(cors());

// Endpoint to generate and serve the invoice
router.get("/invoice/:bookingId", async (req, res) => {
  const { bookingId } = req.params;

  try {
    // Fetch booking details (replace this with your actual logic)
    const bookingDetails = await Booking.findById(bookingId).populate("carId userId");

    if (!bookingDetails) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Generate the invoice
    const invoicePath = await createInvoice(bookingDetails);

    // Check if the file exists
    if (!fs.existsSync(invoicePath)) {
      return res.status(404).json({ message: "Invoice file not found" });
    }

    // Stream the PDF file to the client
    const fileStream = fs.createReadStream(invoicePath);
    fileStream.on("error", (err) => {
      console.error("Error streaming invoice file:", err);
      res.status(500).json({ message: "Failed to stream invoice file" });
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice_${bookingId}.pdf`);
    fileStream.pipe(res);
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).json({ message: "Failed to generate invoice" });
  }
});

export default router;
