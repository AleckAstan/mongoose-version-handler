import mongoose, {Schema, Model} from 'mongoose';
import mongoHistory from "./mongo_history";

// Extend the Mongoose Document type to include custom plugin methods and properties
interface TestDocument extends Document {
    name: string;
    age: number;
    documentVersion: number;
    documentVersionDate?: Date;
    getVersion: (version: number) => Promise<TestDocument>;
}

// Extend the Mongoose Model type to include the history model if required
interface TestModel extends Model<TestDocument> {
    getHistoryModel: () => Model<any>;
}

// Connect to a local MongoDB instance
mongoose.connect('mongodb://localhost:27017/mongoose-plugin-test', {

});

// Define a schema and apply the versioning plugin
const TestSchema = new Schema<TestDocument>({
    name: { type: String, required: true },
    age: { type: Number, required: true },
});

TestSchema.plugin(mongoHistory, {
    versionKey: 'documentVersion',
    versionDateKey: 'documentVersionDate',
    trackDate: true,
    addDateToDocument: true,
});

// Create a model
const TestModel = mongoose.model<TestDocument, TestModel>('Test', TestSchema);

// Test creating and updating a document
async function test() {
    try {
        console.log('Creating a new document...');
        const doc = await TestModel.create({ name: 'John Doe', age: 30 });
        console.log('Saved Document:', doc);

        console.log('Updating the document...');
        doc.age = 31;
        await doc.save();
        console.log('Updated Document:', doc);

        console.log('Retrieving a previous version...');
        const previousVersion = await doc.getVersion(1);
        console.log('Previous Version:', previousVersion);

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


// test().catch((err) => {
//     console.error(err);
//     mongoose.disconnect();
// });
findModel().catch((err) => {
    console.error(err);
    mongoose.disconnect();
});

