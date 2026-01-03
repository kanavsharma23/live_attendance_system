import mongoose from "mongoose";
mongoose.connect(process.env.MONGO_URL!);


export enum UserRole {
  TEACHER = 'teacher',
  STUDENT = 'student'
}
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: Object.values(UserRole), required: true },
});

const ClassSchema = new mongoose.Schema({
  className: String,
  teacherId: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
  },
  studentIds: [{
    type: mongoose.Types.ObjectId,
    ref: 'User',
  }]
});

const AttendanceSchema = new mongoose.Schema({
  status: String,
  classId: {
    type: mongoose.Types.ObjectId,
    ref: 'Class',
  },
  studentId: {
    type: mongoose.Types.ObjectId,
    ref: 'User'
  }
})

export const UserModel = mongoose.model('User', UserSchema);
export const ClassModel = mongoose.model('Class', ClassSchema);
export const AttendanceModel = mongoose.model('Attendance', AttendanceSchema);

