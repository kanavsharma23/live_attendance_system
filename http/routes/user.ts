import { Router } from "express";
import { AddStudentSchema, AttendanceStartSchema, ClassSchema, SigninSchema, SignupSchema } from "../types";
import { AttendanceModel, ClassModel, UserModel, UserRole } from "../models";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { authMiddleware, teacherRoleMiddleware } from "../middleware/authentication";
import mongoose from "mongoose";
dotenv.config();

const router = Router();

let activeSession: { classId: string, startedAt: Date, attendance: Record<string, string> } | null = null;

router.post("/auth/signup", async (req, res) => {
  const { success, data } = SignupSchema.safeParse(req.body);

  if (!success) {
    res.status(400).json({
      success: false,
      error: "Invalid request schema",
    });
    return;
  }

  const user = await UserModel.findOne({ email: data.email });
  if (user) {
    res.status(400).json({
      success: false,
      error: "Email already exists",
    });
    return;
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);


  const userDb = await UserModel.create({
    email: data.email,
    password: hashedPassword,
    name: data.name,
  });

  res.status(201).json({
    success: true,
    data: {
      id: userDb._id,
      name: userDb.name,
      email: userDb.email,
      password: userDb.password,
      role: userDb.role,
    }
  })
});

router.post("/auth/login", async (req, res) => {
  const { success, data } = SigninSchema.safeParse(req.body);
  if (!success) {
    res.status(400).json({
      "success": false,
      "error": "Invalid request schema",
    });
    return;
  }

  const userDb = await UserModel.findOne({
    email: data.email,
  });

  if (!userDb || !(await bcrypt.compare(data.password, userDb.password))) {
    res.status(400).json({
      "success": false,
      "error": "Invalid credentials",
    });
    return;
  }

  const token = jwt.sign({
    role: userDb.role,
    userId: userDb._id,
  }, process.env.JWT_PASSWORD!);
  res.json({
    "success": true,
    "data": {
      "token": token
    }
  })
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  const userDb = await UserModel.findOne({
    _id: req.userId
  });
  if (!userDb) {
    res.status(400).json({
      message: "Control shouldn't reach here"
    });
    return;
  }

  res.json({
    "success": true,
    "data": {
      "_id": userDb._id,
      "name": userDb.name,
      "email": userDb.email,
      "role": userDb.role
    }
  })
});

router.post("/class", authMiddleware, teacherRoleMiddleware, async (req, res) => {
  const { success, data } = ClassSchema.safeParse(req.body);
  if (!success) {
    res.status(400).json({
      success: false,
      error: "Invalid request schema",
    });
    return;
  }

  const classDb = await ClassModel.create({
    className: data.className,
    teacherId: req.userId,
    studentIds: []
  });

  res.json({
    "success": true,
    "_id": classDb._id,
    "teacherId": "t11",
    "studentIds": []
  })
});

router.post("/class/:id/add-student", authMiddleware, teacherRoleMiddleware, async (req, res) => {
  const { success, data } = AddStudentSchema.safeParse(req.body);
  if (!success) {
    res.status(400).json({
      success: false,
      error: "Invalid request schema",
    });
    return;
  }

  const studentId = data.studentId;
  const classDb = await ClassModel.findOne({
    _id: req.params._id
  });

  if (!classDb) {
    res.status(400).json({
      "success": false,
      "error": "class not found"
    })
    return;
  }

  if (classDb.teacherId !== req.userId) {
    res.status(403).json({
      "success": false,
      "error": "Forbidden not class teacher"
    });
    return;
  }
  const userDb = UserModel.findOne({
    _id: studentId
  })
  if (!userDb) {
    res.status(400).json({
      "success": false,
      "error": "Student not found"
    })
    return;
  }
  // Concurrency issues can be here
  classDb.studentIds.push(new mongoose.Types.ObjectId(studentId));
  await classDb.save();
  res.json({
    "success": true,
    "data": {
      "_id": classDb._id,
      "className": classDb.className,
      "teacherId": classDb.teacherId,
      "studentIds": classDb.studentIds
    }
  })
});


router.get("/class/:id", authMiddleware, async (req, res) => {
  const classDb = await ClassModel.findOne({
    _id: req.params.id
  })

  if (!classDb) {
    res.status(400).json({
      "success": false,
      "error": "class not exist"
    });
    return;
  }

  if (classDb.teacherId === req.userId || classDb.studentIds.map(x => x.toString()).includes(req.userId!)) {
    const students = await UserModel.find({
      _id: classDb.studentIds
    });
    res.json({
      "success": true,
      data: {
        _id: classDb._id,
        className: classDb.className,
        teacherId: classDb.teacherId,
        students: students.map(s => ({
          _id: s._id,
          name: s.name,
          email: s.email
        }))
      }
    })
  } else {
    res.status(403).json({
      "success": false,
      "error": "Forbidden"
    })
    return;
  }
});


router.get("/students", authMiddleware, teacherRoleMiddleware, async (req, res) => {
  const users = await UserModel.find({
    role: UserRole.STUDENT
  });

  res.json({
    "success": true,
    "data": users.map(u => ({
      _id: u._id,
      name: u.name,
      email: u.email
    }))
  })
});

router.get("/class/:id/my-attendance", authMiddleware, async (req, res) => {
  const classId = req.params.id
  const userId = req.userId

  const attendance = await AttendanceModel.findOne({
    classId,
    studentId: userId
  });

  if (attendance) {
    res.json({
      "success": true,
      "data": {
        "classId": classId,
        "status": "present"
      }
    })
  } else {
    res.json({
      "success": true,
      "data": {
        "classId": classId,
        "status": null
      }
    })
  }
});


router.post("/attendance/start", authMiddleware, teacherRoleMiddleware, async (req, res) => {
  const { success, data } = AttendanceStartSchema.safeParse(req.body);
  if (!success) {
    res.status(400).json({
      "success": false,
      "error": "Invalid request schema",
    });
    return;
  }

  const classDb = await ClassModel.findOne({
    _id: data.classId
  });

  if (!classDb || classDb.teacherId !== req.userId) {
    res.status(401).json({
      "status": false,
      "error": "No match"
    });
    return;
  }

  activeSession = {
    classId: classDb._id.toString(),
    startedAt: new Date(),
    attendance: {}
  }
  res.json({
    "success": true,
    "data": {
      "classId": activeSession.classId,
      "startedAt": activeSession.startedAt
    }
  })
})



export default router;