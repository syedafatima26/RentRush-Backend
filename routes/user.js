import express from "express";
import {body} from 'express-validator'
import {Signup,login,test,forgotPassword,resetPassword,logout,} from "../Controller/users.js";
import { showAllShowRooms } from "../Controller/showRoom.js";
import { verifyToken } from "../Middleware/verifyToken.js";
import multer from "multer";
const router = express.Router();
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadPath = path.join(__dirname, "../../Rentrush-frontend/public/uploads");
if (!fs.existsSync(uploadPath)) {
  console.log("Directory does not exist. Creating directory...");
  fs.mkdirSync(uploadPath, { recursive: true });
} else {
  console.log("Directory exists.");
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    return cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    req.body.images = filename; // Set filename directly to req.body.images
    cb(null, filename);
    // return cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

router.post("/signup",[upload.array('images',3),body("ownerName").isLength({ min: 3 }),body("email").isEmail(),body("cnic").isLength({min:15,max: 15 }),body("contactNumber").isLength({ min: 12, max: 12 })],Signup);

router.post("/login", [body("email").isEmail()], login);
router.post("/forgot-password", forgotPassword);
router.post("/logout", verifyToken, logout);
//   this is just for testing purpose
router.get("/test", verifyToken, test);
router.get("/showrooms", showAllShowRooms);
export default router;