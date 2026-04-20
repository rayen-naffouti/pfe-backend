import Payment from "../models/payment.js"

export const createPayment = async (req, res) => {
  try {
    const { customer_id, license_id, amount, currency, method, status } = req.body

    if (!customer_id || !license_id || !amount) {
      return res.status(400).json({
        error: "Validation error",
        message: "Customer ID, license ID and amount are required",
      })
    }

    const payment = await Payment.create({
      customer_id,
      license_id,
      amount,
      currency,
      method,
      status,
    })

    res.status(201).json({
      message: "Payment recorded successfully",
      payment,
    })
  } catch (error) {
    console.error("Payment creation error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to record payment",
    })
  }
}

export const getCustomerPayments = async (req, res) => {
  try {
    const { customerId } = req.params
    const payments = await Payment.findByCustomer(customerId)

    res.json(payments)
  } catch (error) {
    console.error("Get payments error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch payments",
    })
  }
}
