import express from 'express';
import {bookCar, updateBooking, cancelBooking} from '../Controller/bookingController.js';
import {verifyToken} from '../Middleware/verifyToken.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const router = express.Router();

router.post('/book', verifyToken, bookCar);
router.put('/update/:bookingId', verifyToken, updateBooking);
router.delete('/cancel/:bookingId', verifyToken, cancelBooking);

router.get('/invoices/:filename', (req, res) => {
    const filePath = path.join(__dirname, '../invoices', req.params.filename);
    res.download(filePath, (err) => {
        if (err) {
            console.error("Error downloading the invoice:", err);
            res.status(404).send("Invoice not found");
        }
    });
});

export default router;