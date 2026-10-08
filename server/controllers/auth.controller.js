import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.model.js";

export async function signup(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Please provide name, email, and password.",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "User with this email already exists.",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
    });

    res.status(201).json({
      message: "User created successfully!",
      userId: user._id,
    });
  } catch (error) {
    console.error("Error in signup:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    res.status(500).json({
      message: "Server error during signup.",
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Please provide email and password.",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials.",
      });
    }

    const payload = {
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful!",
      token,
      userId: user._id,
      email: user.email,
      name: user.name,
    });
  } catch (error) {
    console.error("Error in login:", error);

    res.status(500).json({
      message: "Server error during login.",
    });
  }
}