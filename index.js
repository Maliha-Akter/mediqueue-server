const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

dotenv.config();
const uri = process.env.MONGODB_URI;

const app = express()
const port = process.env.MONGODB_PORT;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`))
// verify token function
const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized: Missing Token" });
    }
    const token = authHeader.split(" ")[1];

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    } catch (error) {
        console.error("JWT Verification Error:", error.message);
        return res.status(403).json({ message: "Forbidden: Invalid Token" });
    }
};

async function run() {
    try {
        // await client.connect();

        const db = client.db("mediqueue");
        const tutorCollection = db.collection("tutor");
        const bookingCollection = db.collection("booking");

        // --- TUTOR ROUTES ---

        app.post("/tutor", verifyToken, async (req, res) => {
            const tutorData = {
                ...req.body,
                userId: req.user.id
            };
            const result = await tutorCollection.insertOne(tutorData);
            res.json(result);
        });

        app.get("/tutor", async (req, res) => {
            try {
                const { name, start, end } = req.query;
                let query = {};
                // searching part
                if (name) {
                    query.tutorName = { $regex: name, $options: 'i' };
                }
                //date part
                if (start || end) {
                    query.sessionStartDate = {};
                    if (start) query.sessionStartDate.$gte = start;
                    if (end) query.sessionStartDate.$lte = end;
                }

                const result = await tutorCollection.find(query).toArray();
                res.json(result);
            } catch (error) {
                console.error("Error fetching tutors:", error);
                res.status(500).json({ message: "Internal Server Error" });
            }
        });

        app.get("/tutor/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const tutor = await tutorCollection.findOne({ _id: new ObjectId(id) });
                if (!tutor) return res.status(404).json({ message: "Tutor not found" });
                res.json(tutor);
            } catch (error) {
                res.status(500).json({ message: "Invalid ID format" });
            }
        });

        app.patch('/tutor/:id', verifyToken, async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;
            const userId = req.user.id;

            const tutor = await tutorCollection.findOne({ _id: new ObjectId(id) });
            if (!tutor) return res.status(404).json({ message: "Tutor profile not found" });

            if (tutor.userId !== userId) {
                return res.status(403).json({ message: "Forbidden: You cannot edit this profile" });
            }

            delete updatedData.userId;

            const result = await tutorCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            );

            res.json(result);
        });

        app.delete('/tutor/:id', verifyToken, async (req, res) => {
            const { id } = req.params;
            const userId = req.user.id;

            const tutor = await tutorCollection.findOne({ _id: new ObjectId(id) });
            if (!tutor) return res.status(404).json({ message: "Tutor profile not found" });

            if (tutor.userId !== userId) {
                return res.status(403).json({ message: "Forbidden: You are not authorized to delete this profile" });
            }

            const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) });
            res.json(result);
        });

        // --- BOOKING ROUTES ---

        app.get('/booking/:userId', verifyToken, async (req, res) => {
            try {
                const { userId } = req.params;
                if (req.user.id !== userId) {
                    return res.status(403).json({ message: "Forbidden: Cannot access other users' data" });
                }
                const result = await bookingCollection.find({ userId: userId }).toArray();
                res.json(result);
            } catch (error) {
                res.status(500).json({ message: "Internal Server Error" });
            }
        });

        app.post("/booking", verifyToken, async (req, res) => {
            try {
                const bookingData = req.body;
                const currentUserId = req.user.id;

                const tutor = await tutorCollection.findOne({ _id: new ObjectId(bookingData.tutorId) });

                if (!tutor) {
                    return res.status(404).json({ message: "Tutor not found" });
                }

                if (tutor.userId === currentUserId) {
                    return res.status(403).json({ message: "Forbidden: You cannot book your own tutor profile." });
                }

                // 1. Converting the existing string to a number in memory
                const currentSlots = parseInt(tutor.totalSlots, 10);

                if (currentSlots <= 0) {
                    return res.status(400).json({ message: "No slots available." });
                }

                // 2. Performing the booking insertion
                const result = await bookingCollection.insertOne({
                    ...bookingData,
                    userId: currentUserId
                });

                await tutorCollection.updateOne(
                    { _id: new ObjectId(bookingData.tutorId) },
                    { $set: { totalSlots: currentSlots - 1 } }
                );

                res.status(201).json({ success: true, result });
            } catch (error) {
                console.error("Booking error:", error);
                res.status(500).json({ message: "Internal server error." });
            }
        });
        app.delete("/booking/:bookingId", async (req, res) => {
            const { bookingId } = req.params;
            const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });
            if (!booking) return res.status(404).json({ message: "Booking record not found" });

            const result = await bookingCollection.deleteOne({ _id: new ObjectId(bookingId) });
            if (booking.tutorId) {
                await tutorCollection.updateOne(
                    { _id: new ObjectId(booking.tutorId) },
                    { $inc: { totalSlots: 1 } }
                );
            }
            res.json(result);
        });

        app.patch("/booking/cancel/:bookingId", verifyToken, async (req, res) => {
            const { bookingId } = req.params;
            const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });
            if (!booking) return res.status(404).json({ message: "Booking record not found" });

            if (booking.userId !== req.user.id) {
                return res.status(403).json({ message: "Forbidden: You cannot cancel this booking" });
            }

            const result = await bookingCollection.updateOne(
                { _id: new ObjectId(bookingId) },
                { $set: { bookingStatus: "cancelled" } }
            );
            res.json(result);
        });

        app.get("/my-tutors/:userId", verifyToken, async (req, res) => {
            try {
                const { userId } = req.params;
                if (!userId) return res.status(400).json({ message: "User ID parameter is required" });
                const result = await tutorCollection.find({ userId: userId }).toArray();
                res.json(result);
            } catch (error) {
                res.status(500).json({ message: "Internal Server Error" });
            }
        });

        app.get("/featured-tutors",async (req, res) => {
            try {
                const result = await tutorCollection.aggregate([
                    { $sample: { size: 6 } }, 
                    { $limit: 6 }             
                ]).toArray();
                res.json(result);
            } catch (error) {
                res.status(500).json({ message: "Failed to load featured tutors" });
            }
        });

        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => { res.send('Hello World!') });
app.listen(port, () => { console.log(`Example app listening on port ${port}`) });