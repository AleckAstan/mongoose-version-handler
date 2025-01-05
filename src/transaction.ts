// import mongooseVersionHandler from "mongoose-version-handler"
import mongoose, {Model, Schema} from 'mongoose';

import mongooseVersionHandler from "../src";

// Extend the Mongoose Document type to include custom plugin methods and properties
interface TestDocument extends Document {
    name: string;
    age: number;
    ob: {
        value: string;
        v2: number;
    };
    documentVersion: number;
    documentVersionDate?: Date;
    getVersion: (version: number) => Promise<TestDocument>;
    rollback: () => void;
}

// Extend the Mongoose Model type to include the history model if required
interface TestModel extends Model<TestDocument> {
    getHistoryModel: () => Model<any>;
}

// Connect to a local MongoDB instance
mongoose.connect('mongodb://localhost:27017/mongoose-plugin-test', {});

// Define a schema and apply the versioning plugin
const TestSchema = new Schema<TestDocument>({
    name: {type: String, required: true},
    age: {type: Number, required: true},
    ob: {
        value: {type: String, required: true},
        v2: {type: Number, required: true},
    }
});

TestSchema.plugin(mongooseVersionHandler, {
    versionKey: 'documentVersion',
    versionDateKey: 'documentVersionDate',
    trackDate: true,
    addDateToDocument: true,
});

// Create a model
const TestModel = mongoose.model<TestDocument, TestModel>('Test', TestSchema);

// Test creating and updating a document
async function create() {
    try {
        console.log('Creating a new document...');
        // const doc = await TestModel.create({name: 'John Doe', age: 30, ob: {value: "Simonda", v2: 21}});
        const doc = new TestModel({name: 'John Doe', age: 30, ob: {value: "Simonda", v2: 21}});
        await doc.save();
        console.log('Saved Document:', doc);

        console.log('Attempting to retrieve an invalid version...');
        try {
            await doc.getVersion(10);
        } catch (error) {
            console.error('Error:');
        }
    } catch (error) {
        console.error('Test Error:', error);
    } finally {
        mongoose.disconnect();
    }
}

async function update() {
    try {
        const doc = await TestModel.findOne({name: 'John Doe'});
        if (!doc) return console.log('No document found.');
        console.log('Updating the document...');
        doc.ob.v2 = 35;
        await doc.save({metadata: {updatedBy: '6762be74ff14f3257509c4c3'}} as any);
        console.log('Updated Document:', doc);

        console.log('Retrieving a previous version...');
        const previousVersion = await doc.getVersion(1);
        console.log('Previous Version:', previousVersion);
    } catch (error) {
        console.error('Test Error:', error);
    } finally {
        mongoose.disconnect();
    }
}

async function findAndUpdate() {
    try {
        const doc = await TestModel.findOne({name: 'John Doe'});
        if (!doc) return console.log('No document found.');
        await TestModel.findOneAndUpdate({name: 'John Doe'}, {
            $set: {
                age: 35,
            }
        }, {metadata: {modifiedBy: 'rakoto'}});
    } catch (error) {
        console.error('Test Error:', error);
    } finally {
        mongoose.disconnect();
    }
}

async function findModel() {
    try {
        const TestHistory = TestModel.getHistoryModel();
        const allTestHistory = await TestHistory.find().lean();
        console.log('All history:', allTestHistory);
    } catch (error) {
        console.error('Test Error:', error);
    } finally {
        mongoose.disconnect();
    }
}

async function rollback() {
    try {
        const doc = await TestModel.findOne({name: 'John Doe'});

        if (!doc) {
            console.error('Document not found');
            return;
        }
        console.log('Rolling back the document...');
        await doc.rollback();
        console.log('Rollback complete:', doc);
    } catch (error) {
        console.error('Test Error:', error);
    } finally {
        mongoose.disconnect();
    }

}


// create().catch((err) => {
//     console.error(err);
// });
// update().catch((err) => {
//     console.error(err);
// });
findAndUpdate().catch((err) => {
    console.error(err);
});
// findModel().catch((err) => {
//     console.error(err);
// });
// rollback().catch((err) => {
//     console.error(err);
// });



