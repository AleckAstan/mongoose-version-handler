import 'mongoose';

declare module 'mongoose' {
    interface Document {
        rollback(): Promise<void>;
        getVersion(version: number): Promise<Document | null>;
    }
}
