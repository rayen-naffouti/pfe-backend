import Product from "../models/product.js"

export const createProduct = async (req, res) => {
  try {
    const { name, slug, description } = req.body

    if (!name || !slug) {
      return res.status(400).json({
        error: "Validation error",
        message: "Name and slug are required",
      })
    }

    const product = await Product.create({ name, slug, description })

    res.status(201).json({
      message: "Product created successfully",
      product,
    })
  } catch (error) {
    console.error("Product creation error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to create product",
    })
  }
}

export const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll()
    res.json(products)
  } catch (error) {
    console.error("Get products error:", error)
    res.status(500).json({
      error: "Server error",
      message: "Failed to fetch products",
    })
  }
}
