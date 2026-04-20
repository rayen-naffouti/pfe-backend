import express from "express"
import { register, login, getProfile } from "../controllers/authController.js"
import { authenticateToken } from "../middleware/authMiddleware.js"
import { loginCustomer, registerCustomer } from "../controllers/customerController.js"
// import User from "../models/user.js"
// import Customer from "../models/customer.js"
// import Payment from "../models/payment.js"
// import License from "../models/license.js"
// import Product from "../models/product.js"
// import LicenseHistory from "../models/licenseHistory.js"

const router = express.Router()

// Initialize users table on first load
// User.createTable().catch(console.error)
// Customer.createTable().catch(console.error)
// Product.createTable().catch(console.error)
// License.createTable().catch(console.error)
// Payment.createTable().catch(console.error)
// LicenseHistory.createTable().catch(console.error)

// Public routes
router.post("/register", registerCustomer)
router.post("/login", loginCustomer)



// Protected routes (require JWT)
router.get("/profile", authenticateToken, getProfile)

export default router
