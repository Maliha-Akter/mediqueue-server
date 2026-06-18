const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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


// const verifyToken = (req, res, next) => {
//     const authHeader = req?.headers?.authorization;
//     if (!authHeader) {
//         return res.status(401).json({ message: "Unauthorized" });
//     }
//     const token = authHeader.split(" ")[1];
//     if (!token) {
//         return res.status(401).json({ message: "Unauthorized" });
//     }


//     next();
// }


async function run() {
    try {
        await client.connect();

        const db = client.db("mediqueue");
        const tutorCollection = db.collection("tutor");
//         const bookCollection = db.collection("bookings");

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
        //     verifyToken, (req, res, next) => {
        //     const header = req.headers.authorization;
        //     console.log(header);
        //     next();
        // },
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


//         // bookCollection
//         app.get('/booking/:userId', async (req, res) => {
//             const { userId } = req.params;
//             const result = await bookCollection.find({ userId: userId }).toArray();
//             res.json(result);
//         })
//         app.post("/booking", async (req, res) => {
//             const bookingData = req.body;
//             const result = await bookCollection.insertOne(bookingData);
//             res.json(result);
//         })


//         app.delete("/booking/:bookingId", async (req, res) => {
//             const { bookingId } = req.params;
//             const result = await bookCollection.deleteOne({
//                 _id: new ObjectId(bookingId),
//             });


//             res.json(result);
//         });




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