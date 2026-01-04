import express from 'express';

import userRoutes from './routes/user';
import expressWs from 'express-ws';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { activeSession as initialSession } from './routes/user';
import { WebSocket } from "ws";

interface CustomWS extends WebSocket {
  user?: {
    userId: string;
    role: string;
  };
}


let activeSession = initialSession;
import dotenv from 'dotenv';
import { AttendanceModel, ClassModel, UserModel } from './models';
dotenv.config();
const app = express();
const {app: wsApp} = expressWs(app);

let allWs: any[] = [];

wsApp.ws("/ws", (ws: CustomWS,req) => {
  try{
    const token = req.query.token;
    if(!token || typeof token !== "string"){
      ws.send(JSON.stringify({
        "event": "ERROR",
        "data": {
          "message": "No token provided"
        }
      }))
      ws.close();
      return;
    }
    const {userId, role} = jwt.verify(token, process.env.JWT_PASSWORD!) as JwtPayload;
    ws.user = {
      userId, role
    }
    allWs.push(ws);
    ws.on("close", () => {
      allWs = allWs.filter(a => a !== ws);
    })

    ws.on('message', async function(msg: any){
      const message = msg.toString();
      let parsedData;
      try{
         parsedData = JSON.parse(message);
      }catch(e){
        console.log(e);
      }
      if(!parsedData){
        ws.send(JSON.stringify({
          "event": "ERROR",
          "data": {
            "message": "Invalid message format"
          }
        }))
        return;
          }
      if(!activeSession){
        ws.send(JSON.stringify({
          "event": "ERROR",
          "data": {
            "message": "No active session"
          }
        }))
        return;
      }
      switch(parsedData.type){
        case "ATTENDANCE_MARKED":
          if(ws.user?.role === "teacher" && ws.user.userId === activeSession?.teacherId){
              activeSession.attendance[parsedData.data.studentId] = parsedData.data.status;
              allWs.map(ws => ws.send(JSON.stringify({
                "event": "ATTENDANCE_MARKED",
                "data": {
                  "studentId": parsedData.data.studentId,
                  "status": parsedData.data.status
                }
              })))
          }else{
            ws.send(JSON.stringify({
                "event": "ERROR",
                "data": {
                  "message": "Forbidden, teacher event only"
                }
              }));
          }
          break;
        case "TODAY_SUMMARY":
          if(ws.user?.role === "teacher" && ws.user.userId === activeSession?.teacherId){
            const classDb = await ClassModel.findOne({
              _id: activeSession?.classId
            })

            const total = classDb?.studentIds.length ?? 0;
            const present: any = Object.keys(activeSession?.attendance || []).filter(x => activeSession?.attendance[x] === "present");
            const absent = total - present;
            allWs.map(ws => ws.send(JSON.stringify({
                "event": "TODAY_SUMMARY",
                "data": {
                  present,
                  absent,
                  total
                }
              })))

          }else{
            ws.send(JSON.stringify({
                "event": "ERROR",
                "data": {
                  "message": "Forbidden, teacher event only"
                }
              }));
          }
          break;

          case "MY_ATTENDANCE":
            if(ws.user?.role === "student"){
              const status = activeSession?.attendance[ws.user.userId];
              if(status){
                ws.send(JSON.stringify({
                  "event": "MY_ATTENDANCE",
                  "data": {
                    "status": status 
                  }
                }))
              }else{
                ws.send(JSON.stringify({
                  "event": "MY_ATTENDANCE",
                  "data": {
                    "status": "not yet updated" 
                  }
                }))
              }
            }else{
              ws.send(JSON.stringify({
                "event": "ERROR",
                "data":{
                  "message": "Forbidden, student event only"
                }
              }))
            }
            break;
          

        case "DONE":
            if(ws.user?.role === "teacher" && ws.user.userId === activeSession?.teacherId){
              const classDb = await ClassModel.findOne({
              _id: activeSession?.classId
            })

            const total = classDb?.studentIds.length ?? 0;
            const present: any = Object.keys(activeSession?.attendance || []).filter(x => activeSession?.attendance[x] === "present");
            const absent = total - present;
            const promises = classDb?.studentIds.map(async studentId => {
              await AttendanceModel.create({
                studentId,
                status: Object.keys(activeSession?.attendance || []).find(x => x === studentId.toString()) ? "present" : "absent",
              });
            }) || [];
            await Promise.all(promises);
            activeSession = null;
            allWs.map(ws => ws.send(JSON.stringify({
              "event": "DONE",
              "data": {
                "message": "Attendance persisted",
                present,
                absent,
                total
              }
            })))
            }else{
              ws.send(JSON.stringify({
                "event": "ERROR",
                "data": {
                  "message": "Forbidden, teacher event only"
                }
              }));
            }
        break;
        default:
            console.log("Unknown message type")
      }
      console.log(msg);
    });
    console.log('socket', req.headers["authorization"]);

  }catch(e){
    ws.send(JSON.stringify({
      "event": "ERROR",
      "data": {
        "message": "Incorrect token"
      }
    }))
    ws.close();
  }
})

wsApp.use(express.json());

wsApp.use("", userRoutes);


wsApp.listen(3000, () => {
  console.log("server running on port 3000");
}) 