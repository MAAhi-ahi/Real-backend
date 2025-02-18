const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Setup
const allowedOrigins = [
  // "http://localhost:5174",
  "https://bloomify-green.vercel.app",
];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Check Email Credentials
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error(
    "⚠️ Missing EMAIL_USER or EMAIL_PASS in environment variables!"
  );
  process.exit(1);
}

// Nodemailer Setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate a random order ID
function generateRandomId() {
  return "ORD" + Math.random().toString(36).substring(2, 7).toUpperCase();
}

let orders = [];

// Create a new order
app.post("/api/order", async (req, res) => {
  console.log("Received Data:", req.body);
  const { address, phone, customer, email, cart = [] } = req.body;

  if (!address || !phone || !customer || !email) {
    return res
      .status(400)
      .json({ status: "fail", message: "Missing required fields" });
  }

  const orderPrice = cart.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0
  );

  const estimatedDelivery = new Date();
  estimatedDelivery.setMinutes(estimatedDelivery.getMinutes() + 30);

  const newOrder = {
    id: generateRandomId(),
    address: req.body.address,
    email: req.body.email,
    phone: req.body.phone,
    customer: req.body.customer,
    status: req.body.status || "pending",
    cart: cart,
    orderPrice: orderPrice,
    estimatedDelivery: estimatedDelivery.toISOString(),
  };

  orders.push(newOrder);
  res.status(201).json({ status: "success", data: newOrder });

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, // Admin email
      cc: email, // Customer email
      subject: "New Order Received! 📦",
      text: `New order received!\n\nCustomer: ${customer}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\nTotal Price: ${orderPrice}\nOrder Details: ${JSON.stringify(
        cart,
        null,
        2
      )}\n\nCheck the dashboard for more details.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📩 Order notification email sent to Admin & ${email}`);
  } catch (error) {
    console.error("❌ Order email sending error:", error);
  }

  // res.status(201).json({ status: "success", data: newOrder });
});

// Update Order Status & Send Confirmation Email
app.post("/update-order-status", async (req, res) => {
  const {
    orderId,
    status,
    customerEmail,
    customerName,
    phone,
    address,
    orderDetails,
  } = req.body;

  if (!orderId || !status) {
    return res.status(400).json({ success: false, message: "Missing data!" });
  }

  io.emit("order-status-update", { orderId, status });

  // If order is confirmed, send confirmation email
  if (status.toLowerCase() === "confirmed") {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: "Your Order is Confirmed! 🎉",
        text: `Dear ${customerName}, 

Great news! 🎉 Your order has been confirmed successfully and is now being prepared by our expert chefs. 🍔🍕🍟 

🚀 Estimated Delivery Time: 30 minutes  
📌 Order ID: ${orderId}  
📍 Delivery Address: ${address}  
📞 Contact Number: ${phone}  
🛒 Order Details: ${orderDetails}  

⏳ Please be ready to receive your order. Kindly keep your phone nearby, and make sure your doorbell is working so that our rider can deliver your delicious meal hassle-free. 🚴‍♂️  

Thank you for choosing **Bloomify**! 🌿 We’re committed to serving you fresh and delicious fast food right at your doorstep. If you have any questions, feel free to contact us.  

Bon Appétit! 🍽️  
**Team Bloomify**  
`,
      };

      await transporter.sendMail(mailOptions);
      console.log(`📩 Confirmation email sent to ${customerEmail}`);
    } catch (error) {
      console.error("❌ Confirmation email error:", error);
    }
  }

  res.status(200).json({
    success: true,
    message: `Order ${orderId} updated to ${status}`,
  });
});

// Get Order by ID
app.get("/api/order/:id", (req, res) => {
  const orderId = req.params.id;
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return res
      .status(404)
      .json({ status: "fail", message: `Couldn't find order #${orderId}` });
  }
  res.status(200).json({ status: "success", data: order });
});

// Update Order by ID
app.patch("/api/order/:id", (req, res) => {
  const orderId = req.params.id;
  const orderIndex = orders.findIndex((o) => o.id === orderId);

  if (orderIndex === -1) {
    return res.status(404).json({ status: "fail", message: "Order not found" });
  }

  orders[orderIndex] = { ...orders[orderIndex], ...req.body };
  res.status(200).json({ status: "success", data: orders[orderIndex] });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
});

// Initialize Socket.io
const io = socketIo(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
});
io.on("connection", (socket) => console.log("Client connected to WebSocket"));
