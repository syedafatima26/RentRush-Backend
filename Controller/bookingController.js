import moment from "moment";
import Booking from "../Model/bookingModel.js";
import Car from "../Model/Car.js";
import { createInvoice } from "./invoiceController.js";


export const bookCar = async (req, res) => {
  console.log("Request Body:", req.body); // Log the request body
  const {
    carId,
    showroomId,
    rentalStartDate,
    rentalStartTime,
    rentalEndDate,
    rentalEndTime,
  } = req.body;

  const userId = req.user;

  if (
    !carId ||
    !showroomId ||
    !rentalStartDate ||
    !rentalStartTime ||
    !rentalEndDate ||
    !rentalEndTime
  ) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    // Check if the car exists
    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).json({ message: "Car not found." });
    }

    // Check if the car is available for booking
    if (car.availability !== "Available") {
      return res
        .status(400)
        .json({ message: "Car is not available for booking." });
    }

    // Check for overlapping bookings
    const overlappingBooking = await Booking.findOne({
      carId,
      $or: [
        {
          rentalStartDate: { $lte: rentalEndDate },
          rentalEndDate: { $gte: rentalStartDate },
        },
        {
          rentalStartDate: { $gte: rentalStartDate, $lte: rentalEndDate },
        },
        {
          rentalEndDate: { $gte: rentalStartDate, $lte: rentalEndDate },
        },
      ],
    });

    if (overlappingBooking) {
      return res
        .status(400)
        .json({ message: "The car is already booked for the selected dates." });
    }

    // Create Date objects from the input dates
    const rentalStartDateis = new Date(rentalStartDate);
    const rentalEndDateis = new Date(rentalEndDate);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (rentalStartDateis < now) {
      return res.status(400).json({
        message: "Rental start date must be in the present or future.",
      });
    }

    if (rentalEndDateis < now) {
      return res
        .status(400)
        .json({ message: "Rental end date must be in the present or future." });
    }

    if (rentalEndDateis < rentalStartDateis) {
      return res
        .status(400)
        .json({ message: "End date must be after the start date." });
    }

    // Calculate the rental duration including the last day
    const rentalDuration =
      (rentalEndDateis - rentalStartDateis) / (1000 * 60 * 60 * 24) + 1; // Add 1 to include the end date
    const daysRented = Math.max(0, Math.ceil(rentalDuration));
    const totalPrice = daysRented * car.rentRate;

    // Format dates as "Tue Dec 10 2024"
    const formattedRentalStartDate = rentalStartDateis.toDateString();
    const formattedRentalEndDate = rentalEndDateis.toDateString();

    // Convert rental times to 12-hour format
    const formatTimeTo12Hour = (time) => {
      const [hour, minute] = time.split(":").map(Number);
      const period = hour >= 12 ? "PM" : "AM";
      const formattedHour = hour % 12 || 12; // Convert hour to 12-hour format
      return `${formattedHour}:${minute.toString().padStart(2, "0")} ${period}`;
    };

    const formattedRentalStartTime = formatTimeTo12Hour(rentalStartTime);
    const formattedRentalEndTime = formatTimeTo12Hour(rentalEndTime);

    const newBooking = new Booking({
      carId,
      userId,
      showroomId,
      rentalStartDate: formattedRentalStartDate, // Save as formatted String
      rentalStartTime: formattedRentalStartTime, // Save in 12-hour format
      rentalEndDate: formattedRentalEndDate, // Save as formatted String
      rentalEndTime: formattedRentalEndTime, // Save in 12-hour format
      totalPrice,
    });

    await newBooking.save();

    const invoicePath = await createInvoice({
      _id: newBooking._id,
      carId,
      userId,
      rentalStartDate: formattedRentalStartDate,
      rentalEndDate: formattedRentalEndDate,
      rentalStartTime: formattedRentalStartTime,
      rentalEndTime: formattedRentalEndTime,
      totalPrice,
    });

    // Update car availability to "Rented Out"
    car.availability = "Rented Out";
    await car.save();

    const invoiceUrl = `${req.protocol}://${req.get(
      "host"
    )}/api/bookcar/invoices/invoice_${newBooking._id}.pdf`;

    res.status(201).json({
      message: "Car booked successfully",
      booking: newBooking,
      invoiceUrl,
      carAvailability: car.availability, // Return the updated car availability status
    });
  } catch (error) {
    console.error("Error booking car:", error);
    if (error.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: "Invalid input data.", details: error.errors });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: "Duplicate booking detected." });
    }
    return res
      .status(500)
      .json({ message: "Server error. Please try again later." });
  }
};

export const getUserBookings = async (req, res) => {
  try {
    const userId = req.user;
    if (!userId) {
      console.log("No user ID found in request");
      return res.status(400).json({ message: "User ID is required" });
    }
    console.log("User ID in getUserBookings:", userId);

    const bookings = await Booking.find({ userId: userId })
      .populate("carId")
      .populate("showroomId", "-password");

    console.log("Bookings after population:", bookings);

    if (!bookings || bookings.length === 0) {
      return res.status(404).json({ message: "No active bookings found" });
    }

    // Create an array to hold the bookings with additional details
    const bookingsWithDetails = bookings.map((booking) => ({
      ...booking.toObject(),
      carDetails: booking.carId, // Car details populated
      showroomDetails: booking.showroomId, // Showroom details populated
    }));

    res.status(200).json(bookingsWithDetails);
  } catch (error) {
    console.error("Error fetching bookings:", error);

    // Check if the error is a Mongoose error
    if (error.name === "MongoError") {
      return res.status(500).json({ message: "Database error occurred" });
    }

    // Handle other types of errors
    return res.status(500).json({ message: "Server error" });
  }
};

export const updateBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { rentalStartDate, rentalEndDate, rentalStartTime, rentalEndTime } =
    req.body;

  try {
    // Find the booking by ID
    const booking = await Booking.findById(bookingId).populate("carId");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Calculate the current time and the rental start time
    const currentTime = new Date();
    const rentalStartDateTime = new Date(
      `${booking.rentalStartDate}T${booking.rentalStartTime}`
    );

    // Restrict updates if the rental start time has already passed
    if (rentalStartDateTime <= currentTime) {
      return res.status(400).json({
        message:
          "You can only update the booking before the rental start time.",
      });
    }

    // Update booking details if provided
    if (rentalStartDate) booking.rentalStartDate = rentalStartDate; // Keep as string
    if (rentalEndDate) booking.rentalEndDate = rentalEndDate; // Keep as string
    if (rentalStartTime) booking.rentalStartTime = rentalStartTime; // Keep as string
    if (rentalEndTime) booking.rentalEndTime = rentalEndTime; // Keep as string

    // Recalculate the rental start and end times
    const updatedRentalStartDateTime = new Date(
      `${booking.rentalStartDate}T${booking.rentalStartTime}`
    );
    const updatedRentalEndDateTime = new Date(
      `${booking.rentalEndDate}T${booking.rentalEndTime}`
    );

    // Validate the updated rental times
    if (updatedRentalEndDateTime <= updatedRentalStartDateTime) {
      return res.status(400).json({
        message: "Rental end time must be after the rental start time.",
      });
    }

    // Check for overlapping bookings
    const overlappingBooking = await Booking.findOne({
      carId: booking.carId,
      _id: { $ne: bookingId }, // Exclude the current booking
      $or: [
        {
          rentalStartDate: { $lte: booking.rentalEndDate },
          rentalEndDate: { $gte: booking.rentalStartDate },
        },
      ],
    });
    if (overlappingBooking) {
      return res
        .status(400)
        .json({ message: "The car is already booked for the selected dates." });
    }

    // Recalculate the total price based on the updated dates and times
    const car = booking.carId; // The car is already populated
    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    const rentalDuration =
      (updatedRentalEndDateTime - updatedRentalStartDateTime) /
        (1000 * 60 * 60 * 24) +
      1; // Add 1 to include the last day
    const daysRented = Math.max(0, Math.ceil(rentalDuration));
    const totalPrice = daysRented * car.rentRate;

    booking.totalPrice = totalPrice; // Update the total price

    // Save the updated booking
    await booking.save();

    // Return the updated booking
    res.status(200).json({
      message: "Booking updated successfully",
      booking,
    });
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({ message: "Error updating booking", error });
  }
};

export const extendBooking = async (req, res) => {
  const { bookingId } = req.params;
  const { rentalEndDate, rentalEndTime } = req.body;

  try {
    // Find the booking by ID
    const booking = await Booking.findById(bookingId).populate("carId");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Calculate the current time and the rental start time
    const currentTime = new Date();
    const rentalStartDateTime = new Date(
      `${booking.rentalStartDate}T${booking.rentalStartTime}`
    );

    // Restrict extensions if the rental start time has already passed
    if (rentalStartDateTime <= currentTime) {
      return res.status(400).json({
        message: "You can only extend the booking before the rental start time.",
      });
    }

    // Update rental end date and time if provided
    if (rentalEndDate) {
      if (isNaN(new Date(rentalEndDate))) {
        return res.status(400).json({ message: "Invalid rental end date format." });
      }
      booking.rentalEndDate = rentalEndDate; // Keep as string
    }

    if (rentalEndTime) {
      if (!/^\d{2}:\d{2}$/.test(rentalEndTime)) {
        return res.status(400).json({ message: "Invalid rental end time format." });
      }
      booking.rentalEndTime = rentalEndTime; // Keep as string
    }

    // Recalculate the rental start and end times
    const updatedRentalEndDateTime = new Date(
      `${booking.rentalEndDate}T${booking.rentalEndTime}`
    );

    // Validate the updated rental times
    if (updatedRentalEndDateTime <= rentalStartDateTime) {
      return res.status(400).json({
        message: "Rental end time must be after the rental start time.",
      });
    }

    // Check for overlapping bookings
    const overlappingBooking = await Booking.findOne({
      carId: booking.carId,
      _id: { $ne: bookingId }, // Exclude the current booking
      $or: [
        {
          rentalStartDate: { $lte: booking.rentalEndDate },
          rentalEndDate: { $gte: booking.rentalStartDate },
        },
      ],
    });
    if (overlappingBooking) {
      return res
        .status(400)
        .json({ message: "The car is already booked for the selected dates." });
    }

    // Recalculate the total price based on the updated dates and times
    const rentalDuration =
      (updatedRentalEndDateTime - rentalStartDateTime) / (1000 * 60 * 60 * 24) + 1; // Add 1 to include the last day
    const daysRented = Math.max(0, Math.ceil(rentalDuration));
    const totalPrice = daysRented * booking.carId.rentRate; // Assuming rentRate is available in carId

    if (isNaN(totalPrice) || totalPrice <= 0) {
      return res.status(400).json({ message: "Failed to calculate total price." });
    }

    booking.totalPrice = totalPrice; // Update the total price

    // Save the updated booking
    await booking.save();

    // Generate the invoice
    const invoicePath = await createInvoice({
      _id: booking._id,
      carId: booking.carId,
      userId: booking.userId,
      rentalStartDate: booking.rentalStartDate,
      rentalEndDate: booking.rentalEndDate,
      rentalStartTime: booking.rentalStartTime,
      rentalEndTime: booking.rentalEndTime,
      totalPrice,
    });

    const invoiceUrl = `${req.protocol}://${req.get("host")}/api/bookcar/invoices/invoice_${booking._id}.pdf`;

    // Return the updated booking and invoice URL
    res.status(200).json({
      message: "Booking extended successfully",
      booking,
      invoiceUrl,
    });
  } catch (error) {
    console.error("Error extending booking:", error);
    res.status(500).json({ message: "Error extending booking", error });
  }
};

// export const extendBooking = async (req, res) => {
//   const { bookingId } = req.params;
//   const { rentalEndDate, rentalEndTime } = req.body;

//   try {
//     // Find the booking by ID
//     const booking = await Booking.findById(bookingId).populate("carId");
//     if (!booking) {
//       return res.status(404).json({ message: "Booking not found" });
//     }

//     // Calculate the current time and the rental start time
//     const currentTime = new Date();
//     const rentalStartDateTime = new Date(
//       `${booking.rentalStartDate}T${booking.rentalStartTime}`
//     );

//     // Restrict extensions if the rental start time has already passed
//     if (rentalStartDateTime <= currentTime) {
//       return res.status(400).json({
//         message: "You can only extend the booking before the rental start time.",
//       });
//     }

//     // Update rental end date and time if provided
//     if (rentalEndDate) {
//       if (isNaN(new Date(rentalEndDate))) {
//         return res.status(400).json({ message: "Invalid rental end date format." });
//       }
//       booking.rentalEndDate = rentalEndDate; // Keep as string
//     }

//     if (rentalEndTime) {
//       if (!/^\d{2}:\d{2}$/.test(rentalEndTime)) {
//         return res.status(400).json({ message: "Invalid rental end time format." });
//       }
//       booking.rentalEndTime = rentalEndTime; // Keep as string
//     }

//     // Recalculate the rental start and end times
//     const updatedRentalEndDateTime = new Date(
//       `${booking.rentalEndDate}T${booking.rentalEndTime}`
//     );

//     // Validate the updated rental times
//     if (updatedRentalEndDateTime <= rentalStartDateTime) {
//       return res.status(400).json({
//         message: "Rental end time must be after the rental start time.",
//       });
//     }

//     // Check for overlapping bookings
//     const overlappingBooking = await Booking.findOne({
//       carId: booking.carId,
//       _id: { $ne: bookingId }, // Exclude the current booking
//       $or: [
//         {
//           rentalStartDate: { $lte: booking.rentalEndDate },
//           rentalEndDate: { $gte: booking.rentalStartDate },
//         },
//       ],
//     });
//     if (overlappingBooking) {
//       return res
//         .status(400)
//         .json({ message: "The car is already booked for the selected dates." });
//     }

//     // Recalculate the total price based on the updated dates and times
//     const rentalDuration =
//       (updatedRentalEndDateTime - rentalStartDateTime) / (1000 * 60 * 60 * 24) + 1; // Add 1 to include the last day
//     const daysRented = Math.max(0, Math.ceil(rentalDuration));
//     const totalPrice = daysRented * booking.carId.rentRate; // Assuming rentRate is available in carId

//     if (isNaN(totalPrice) || totalPrice <= 0) {
//       return res.status(400).json({ message: "Failed to calculate total price." });
//     }

//     booking.totalPrice = totalPrice; // Update the total price

//     // Save the updated booking
//     await booking.save();

//     // Return the updated booking
//     res.status(200).json({
//       message: "Booking extended successfully",
//       booking,
//     });
//   } catch (error) {
//     console.error("Error extending booking:", error);
//     res.status(500).json({ message: "Error extending booking", error });
//   }
// };

export const cancelBooking = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user;

  try {
    const booking = await Booking.findOne({ _id: bookingId, userId });
    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found or unauthorized access." });
    }

    const car = await Car.findById(booking.carId);
    if (car) {
      car.availability = "Available";
      await car.save();
    }

    await Booking.findByIdAndDelete(bookingId);

    return res.status(200).json({ message: "Booking canceled successfully." });
  } catch (error) {
    console.error("Error canceling booking:", error);
    return res
      .status(500)
      .json({ message: "Server error. Please try again later." });
  }
};

export const Return_car = async (req, res) => {
  try {
    const { BookingId } = req.params;
    const booking = await Booking.findById(BookingId).populate("carId");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    console.log("booking details", booking);
    const car = await Car.findById(booking.carId._id);
    if (!car) {
      return res.status(404).json({ message: "car not found" });
    }
    io.emit(`notification${car.userId}`, {
      message: "Car return request recieved",
    });
    return res
      .status(200)
      .json({ message: "Return request sent to showroom  owner for approved" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Something went wrong", error });
  }
};

