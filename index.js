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