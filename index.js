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

// const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));
const JWKS = createRemoteJWKSet(new URL("http://localhost:3000/api/auth/jwks"))
const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers?.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Unauthorized: Missing Token" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload; 
        console.log(payload);
        next();
    } catch (error) {
        console.error("JWT Verification Error:", error.message);
        return res.status(403).json({ message: "Forbidden: Invalid Token" });
    }
};

async function run() {
    try {
        await client.connect();

        const db = client.db("mediqueue");
        const tutorCollection = db.collection("tutor");
        const bookingCollection = db.collection("booking");

        // 1. Tutor Table
        //a)get
        app.get("/tutor", async (req, res) => {
            const result = await tutorCollection.find().toArray();
            res.json(result);

        })

        app.post("/tutor", async (req, res) => {
            const tutorData = req.body;
            console.log(tutorData);
            const result = await tutorCollection.insertOne(tutorData);

            res.json(result);
        })

        app.get('/tutor/:id',
            //      verifyToken, (req, res, next) => {
            //     const header = req.headers.authorization;
            //     console.log(header);
            //     next();
            // },
            verifyToken,
            async (req, res) => {
                const { id } = req.params;
                const result = await tutorCollection.findOne({ _id: new ObjectId(id) });
                res.json(result);
            })



        app.patch('/tutor/:id', async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;
            console.log(updatedData);
            const result = await tutorCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updatedData }
            )
            res.json(result);
        })
        app.delete('/tutor/:id', async (req, res) => {
            const { id } = req.params;
            const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) })
            res.json(result);
        })


        // bookCollection
        app.get('/booking/:userId', async (req, res) => {
            const { userId } = req.params;
            const result = await bookingCollection.find({ userId: userId }).toArray();
            res.json(result);
        });
        app.post("/booking", async (req, res) => {
            const bookingData = req.body;
            const result = await bookingCollection.insertOne(bookingData);
            res.json(result);
        })


        app.delete("/booking/:bookingId", async (req, res) => {
            const { bookingId } = req.params;

            // 1. Finding the booking record first to look up the tutorId
            const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });

            if (!booking) {
                return res.status(404).json({ message: "Booking record not found" });
            }

            // 2. Deleting the appointment record
            const result = await bookingCollection.deleteOne({ _id: new ObjectId(bookingId) });

            // 3. Updating the tutor's profile to add 1 slot back
            if (booking.tutorId) {
                await tutorCollection.updateOne(
                    { _id: new ObjectId(booking.tutorId) },
                    { $inc: { totalSlots: 1 } } // Automatically increases the slots count by 1
                );
            }

            res.json(result);
        });


        app.patch("/booking/cancel/:bookingId", async (req, res) => {
            const { bookingId } = req.params;

            // 1. Find the booking record
            const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });

            if (!booking) {
                return res.status(404).json({ message: "Booking record not found" });
            }

            // 2. Update booking status to 'cancelled'
            const result = await bookingCollection.updateOne(
                { _id: new ObjectId(bookingId) },
                { $set: { bookingStatus: "cancelled" } }
            );

            // 3. Update the tutor's profile to add 1 slot back
            if (booking.tutorId) {
                await tutorCollection.updateOne(
                    { _id: new ObjectId(booking.tutorId) },
                    { $inc: { totalSlots: 1 } }
                );
            }

            res.json(result);
        });
        app.get("/my-tutors/:userId", async (req, res) => {
            try {
                const { userId } = req.params;

                if (!userId) {
                    return res.status(400).json({ message: "User ID parameter is required" });
                }

                // Query documents matching the creator's userId string
                const result = await tutorCollection.find({ userId: userId }).toArray();
                res.json(result);
            } catch (error) {
                console.error("Error retrieving user tutors:", error);
                res.status(500).json({ message: "Internal Server Error" });
            }
        });

        // Featured Data
        app.get("/featured-tutors", async (req, res) => {
            try {
                const result = await tutorCollection
                    .aggregate([
                        { $sample: { size: 6 } }
                    ])
                    .toArray();

                res.json(result);
            } catch (error) {
                console.error("Error fetching featured tutors:", error);
                res.status(500).json({ message: "Failed to load featured tutors" });
            }
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})