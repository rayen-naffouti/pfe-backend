import express from "express"
import { register, login, getProfile } from "../controllers/authController.js"
import { authenticateToken } from "../middleware/authMiddleware.js"
import { loginCustomer, registerCustomer } from "../controllers/customerController.js"
import {
  completeAccountActivation,
  resendAccountActivation,
  validateActivationToken,
} from "../controllers/accountActivationController.js"
import {
  completePasswordReset,
  forgotPassword,
  validateResetToken,
} from "../controllers/passwordResetController.js"
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
router.post("/account-activation/resend", resendAccountActivation)
router.get("/account-activation/validate", validateActivationToken)
router.post("/account-activation", completeAccountActivation)
router.post("/forgot-password", forgotPassword)
router.get("/reset-password/validate", validateResetToken)
router.post("/reset-password", completePasswordReset)



// Protected routes (require JWT)
router.get("/profile", authenticateToken, getProfile)

export default router
