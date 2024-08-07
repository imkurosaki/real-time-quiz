import { Socket } from "socket.io";
import { Problem } from "../lib/types/types";
import { v4 as uuidv4 } from 'uuid';
import { IoManager } from "./IoManager";
import { generateRandomString } from "../lib/randomStrings";
import prisma from "../db";
import { generateToken } from "../lib/generateToken";
import { Leaderboard } from "../lib/types/types";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

export enum Status {
   Waiting = "waiting",
   Started = "started",
   Ongoing = "ongoing",
   Finished = "finished",
}

export interface Room {
   id: string;
   name: string;
   admin: string;
   status: Status;
   users: User[];
}

export interface User {
   id: string;
   username: string;
   points: number;
   image: string;
}

// timer 10 seconds to answer the problems
export const MAX_TIME_SEC = 10;
const MAXPOINTS = 200;

export class AdminManager {
   private rooms: Room[];

   constructor() {
      this.rooms = [];
   }

   findRoom(roomId: string) {
      const room = this.rooms.find((room: any) => room.id === roomId);
      if (!room) {
         return {
            room: null,
            error: "Room doesn't exist"
         };
      }
      return {
         room,
         error: null
      };
   }

   async addRoom(roomName: string, socket: Socket) {
      const room = await prisma.room.findFirst({
         where: {
            name: roomName,
            userId: socket.decoded.id
         }
      });

      if (room) {
         socket.emit("error", {
            message: `${roomName} Room is already exist`
         })
         return;
      }

      try {
         const roomId: string = generateRandomString(15)
         await prisma.room.create({
            data: {
               id: roomId,
               name: roomName,
               userId: socket.decoded.id,
            }
         });
         await prisma.quiz.create({
            data: {
               roomId: roomId
            }
         })
         socket.emit("room", {
            message: "Room is successfully added",
         })

         const rooms = await prisma.room.findMany({
            where: {
               userId: socket.decoded.id
            },
            orderBy: {
               createdAt: 'desc'
            },
            select: {
               id: true,
               name: true,
               status: true,
               createdAt: true,
               quizes: true
            }
         });
         socket.emit("getMyRooms", rooms);
      } catch (e: any) {
         socket.emit("error", {
            error: `${roomName} Room is already exist`
         })
      }
   }

   async deleteRoom(socket: Socket, roomId: string) {
      try {
         const result = await prisma.room.delete({
            where: {
               id: roomId
            }
         });

         const rooms = await prisma.room.findMany({
            where: {
               userId: socket.decoded.id
            }
         })
         socket.emit("getMyRooms", rooms);
         return {
            status: "success",
            message: `Room ${result.name} is successfully deleted.`
         }
      } catch (e: any) {
         return {
            status: "error",
            message: `Room is not found.`
         }
      }
   }

   async getRoom(socket: Socket, roomId: string) {
      let leaderboard: any = [];
      try {
         const room = await prisma.room.findUnique({
            where: {
               id: roomId,
               userId: socket.decoded.id
            },
            select: {
               quizes: true,
               status: true,
            }
         });
         if (room?.status === "FINISHED") {
            const quizId = room.quizes[0].id;
            leaderboard = await this.getLeaderboard(quizId, roomId, 0);
         }
         return {
            leaderboard,
            room
         };
      } catch (e: any) {
         return {
            status: 'error',
            message: "Room doesn't exist"
         }
      }
   }

   async getRooms(socket: Socket) {
      const rooms = await prisma.room.findMany({
         where: {
            userId: socket.decoded.id
         },
         orderBy: {
            createdAt: 'desc'
         },
         select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            quizes: true
         }
      });
      return rooms;
   }

   async registerUser(username: string, email: string, password: string) {
      try {
         const salt = bcrypt.genSaltSync(10);
         const hashPassword = bcrypt.hashSync(password, salt);
         const result = await prisma.user.create({
            data: {
               username: username,
               email: email,
               password: hashPassword,
               image: Math.floor(Math.random() * 7) + 1,
               signInType: 'Traditional'
            }
         });
         return {
            status: 'success',
            message: "Username are successfully register"
         }
      } catch (e: any) {
         return {
            status: 'error',
            message: "Email / Username is already taken"
         }
      }
   }

   async signinUser(email: string, password: string, socket: Socket) {
      try {
         const user = await prisma.user.findFirst({
            where: {
               email: email
            }
         });

         if (!user) {
            socket.emit("error", {
               error: "Username is not found"
            });
            return;
         } else if (!bcrypt.compareSync(password, user.password)) {
            socket.emit("error", {
               error: "Password is not match"
            });
            return;
         } else {
            socket.emit("signed", {
               message: "You've successfully login",
               data: {
                  id: user.id,
                  username: user.username,
                  image: user.image,
                  email: user.email
               },
               token: `Bearer ${generateToken({ userId: user.id })}`
            })
         }
      } catch (e: any) {
         socket.emit("server-error", {
            error: "Something error happened, try again later."
         })
      }
   }

   async addProblem(quizId: string, title: string, options: string[], answer: number, countdown: number, socket: Socket) {
      try {
         const problem = await prisma.problem.create({
            data: {
               title: title,
               answer: answer,
               countdown: countdown,
               quizId: quizId
            }
         });

         const optionPromises = options.map((option: string, key: number) => {
            return prisma.option.create({
               data: {
                  choice: option,
                  problemId: problem.id,
                  index: key
               }
            })
         });

         await Promise.all(optionPromises);

         socket.emit("success", {
            message: "Successfully added the problem"
         })

         socket.emit("adminAddProblem", {
            addedProblem: 1
         })
      } catch (e: any) {
         socket.emit("error", {
            message: "Failed to add problem"
         })
      }
   }

   calculatePoints(startTime: number, endTime: number, countdown: number) {
      const durationInMinutes = endTime - startTime;
      const durationInSeconds = durationInMinutes / 1000;
      const points = durationInSeconds > countdown ? 0 :
         MAXPOINTS * (1 - (durationInSeconds / countdown));

      return Math.round(points * 1000) / 1000;
   }

   async start(roomId: string, quizId: string, socket: Socket): Promise<number> {
      const room = await prisma.room.findFirst({
         where: {
            id: roomId
         },
         select: {
            quizes: {
               where: {
                  id: quizId,
                  roomId: roomId
               },
               select: {
                  problems: {
                     orderBy: {
                        createdAt: 'asc'
                     },
                     select: {
                        id: true,
                        title: true,
                        options: {
                           orderBy: {
                              index: 'asc'
                           }
                        },
                        answer: true,
                        countdown: true,
                        quizId: true
                     }
                  },
                  currentProblem: true,
                  roomId: true
               }
            },
            status: true,
         }
      })

      if (!room?.quizes) {
         socket.emit("error", {
            message: `Quiz id ${quizId} doesn't found`
         })
         return 0;
      }

      //select the first problem 
      const problem = room?.quizes[0].problems[0];
      if (!problem) {
         socket.emit("error", {
            message: `You don't have a problem yet`
         })
         return 0;
      }

      if (room.status === "ONGOING" || room.status === "STARTED") {
         socket.emit("error", {
            message: `You can't restart the quiz`
         })
         return 0;
      }

      try {
         await prisma.$transaction(async (prisma: any) => {
            const quiz = await prisma.quiz.update({
               where: {
                  id: quizId,
                  roomId: roomId
               },
               data: {
                  currentProblem: room.quizes[0].currentProblem + 1
               },
               select: {
                  problems: true,
                  roomId: true
               }
            });

            await prisma.problem.update({
               where: {
                  id: problem.id,
               },
               data: {
                  startTime: new Date()
               }
            });

            const updateRoom = await prisma.room.update({
               where: {
                  id: roomId
               },
               data: {
                  status: "STARTED"
               }
            })
            // join the admin roomId
            socket.join(roomId);

            IoManager.io.to(roomId).emit("participantProblem", {
               problem,
               index: 0,
               roomId: quiz.roomId,
               currentProblem: 1,
               noOfProblems: quiz.problems.length,
               status: updateRoom.status
            });

            IoManager.io.to(roomId).emit("adminProblem", {
               problem,
               index: 0,
               currentProblem: 1,
               roomId: quiz.roomId,
               noOfProblems: quiz.problems.length,
               status: room.status
            })
            this.getLeaderboard(quizId, roomId, problem.countdown);
         });
         return problem.countdown
      } catch (e: any) {
         socket.emit("error", {
            message: "Error fetching quiz, try again later"
         })
         return 0;
      }
   }

   async next(roomId: string, quizId: string, socket: Socket) {
      const room = await prisma.room.findFirst({
         where: {
            id: roomId
         },
         select: {
            quizes: {
               where: {
                  id: quizId,
                  roomId: roomId
               },
               select: {
                  problems: {
                     orderBy: {
                        createdAt: 'asc'
                     },
                     select: {
                        id: true,
                        title: true,
                        options: {
                           orderBy: {
                              index: 'asc'
                           }
                        },
                        answer: true,
                        countdown: true,
                        quizId: true,
                        createdAt: true
                     }
                  },
                  currentProblem: true,
                  roomId: true
               }
            },
            status: true,
            participants: true
         }
      });

      if (!room?.quizes) {
         socket.emit("error", {
            message: `Quiz id ${quizId} doesn't found`
         })
         return 0;
      }

      const noOfProblems: number = room.quizes[0].problems.length;
      const quiz = room.quizes[0];
      if (noOfProblems === quiz.currentProblem) {
         socket.emit("error", {
            message: `There's no problems left.`
         })
         return 0;
      }

      if (room.status === "WAITING") {
         socket.emit("error", {
            message: `Quiz is not started yet`
         })
         return 0;
      }

      const problem = room.quizes[0].problems[quiz.currentProblem];
      try {
         await prisma.$transaction(async (prisma: any) => {
            // Update Quiz
            const newQuiz = await prisma.quiz.update({
               where: {
                  id: quizId,
                  roomId: roomId
               },
               data: {
                  currentProblem: room.quizes[0].currentProblem + 1
               }
            });

            // Update Problem
            await prisma.problem.update({
               where: {
                  id: problem.id,
               },
               data: {
                  startTime: new Date()
               }
            });

            // Update Room
            await prisma.room.update({
               where: {
                  id: roomId
               },
               data: {
                  status: "ONGOING"
               }
            })

            IoManager.io.to(roomId).emit("participantProblem", {
               problem,
               index: 0,
               roomId: quiz.roomId,
               currentProblem: newQuiz.currentProblem,
               noOfProblems: quiz.problems.length,
               status: room.status
            });

            IoManager.io.to(roomId).emit("adminProblem", {
               problem,
               index: 0,
               roomId: quiz.roomId,
               currentProblem: newQuiz.currentProblem,
               noOfProblems: quiz.problems.length,
               status: room.status
            })
            this.getLeaderboard(quizId, roomId, problem.countdown);
         });
         return problem.countdown
      } catch (e: any) {
         socket.emit("error", {
            message: "Error fetching quiz, try again later"
         })
         return 0;
      }
   }

   async endQuiz(roomId: string, quizId: string, socket: Socket) {
      const leaderboard: Leaderboard[] = await prisma.points.findMany({
         where: {
            quizId: quizId
         },
         orderBy: {
            points: 'desc'
         },
         select: {
            points: true,
            participant: {
               select: {
                  id: true,
                  username: true,
                  image: true
               }
            }
         }
      })

      try {
         await prisma.$transaction(async (prisma: any) => {
            await prisma.room.update({
               where: {
                  id: roomId
               },
               data: {
                  status: "FINISHED",
               }
            });

            await prisma.quiz.update({
               where: {
                  id: quizId,
                  roomId: roomId
               },
               data: {
                  currentProblem: 0
               }
            });

            IoManager.io.to(roomId).emit("end", {
               status: "FINISHED",
               leaderboard: leaderboard
            });
         });
      } catch (e: any) {
         socket.emit("error", {
            message: "Server failure, try agin later."
         })
      }
   }

   async getLeaderboard(quizId: string, roomId: string, countdown: number) {
      let leaderboard: Leaderboard[] = [];
      return await new Promise((resolve: any) => {
         setTimeout(async () => {
            leaderboard = await prisma.points.findMany({
               where: {
                  quizId: quizId
               },
               orderBy: {
                  points: 'desc'
               },
               select: {
                  points: true,
                  participant: {
                     select: {
                        id: true,
                        username: true,
                        image: true
                     }
                  }
               }
            })
            IoManager.io.to(roomId).emit("leaderboard", {
               leaderboard: leaderboard,
               status: "LEADERBOARD",
            });
            resolve(leaderboard)
         }, countdown * 1000);
      });
   }

   async getNoOfProblems(roomId: string, quizId: string, socket: Socket) {
      try {
         const room = await prisma.room.findUnique({
            where: {
               id: roomId
            },
            select: {
               quizes: {
                  where: {
                     id: quizId
                  },
                  select: {
                     problems: true
                  }
               }
            }
         });
         if (!room?.quizes.length) {
            socket.emit("error", {
               message: `Quiz is not found`
            })
            return 0;
         }

         const problemsLength = room?.quizes[0].problems.length;
         socket.emit("noOfProblems", {
            problemsLength
         });
         return problemsLength;
      } catch (e: any) {
         socket.emit("error", {
            message: `Server error try again later`
         });
         return 0;
      }
   }
}
