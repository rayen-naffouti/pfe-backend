import Product from "../models/product.js"

export const createProduct = async (req, res) => {
  try {
    const { name, slug, description, tenant_id, host_base_url } = req.body

    if (!name || !slug || !tenant_id || !host_base_url) {
      return res.status(400).json({
        error: "Validation error",
        message: "Name, slug, tenant ID and host base URL are required",
      })
    }

    try {
      new URL(host_base_url)
    } catch {
      return res.status(400).json({
        error: "Validation error",
        message: "Host base URL must be a valid URL",
      })
    }

    const product = await Product.create({ name, slug, description, tenant_id, host_base_url })

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
