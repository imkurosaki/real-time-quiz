import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom"
import Quizes, { ParticipantProblem } from "../components/Room/Quizes";
import WaitingPage, { Participant } from "../components/Room/WaitingPage";
import Leaderboard from "../components/Room/Leaderboard";
import EndRoom from "../components/Room/EndRoom";
import { useSocket } from "../lib/hooks";
import { Socket } from "socket.io-client";
import { participantInfo } from "../store/participant";
import { useRecoilState, useRecoilValue } from "recoil";
import Cookies from "js-cookie";
import { AdminInfo, adminInfo, currentRoomJoined } from "../store/admin";

export default function Room() {
   const [roomId, setRoomId] = useState("");
   const navigate = useNavigate();
   const [status, setStatus] = useState("WAITING")
   const [leaderboard, setLeaderboard] = useState<Participant[]>([]);
   const [problem, setProblem] = useState<ParticipantProblem>({
      id: "",
      title: "",
      options: [],
      answer: 0,
      countdown: 0,
      quizId: "",
   });
   const [participants, setPartcipants] = useState<Participant[]>([]);
   const [userInfo, setUserInfo] = useState({
      id: "",
      username: "",
      image: "",
      points: 0
   })
   const socket: Socket = useSocket(Cookies.get('token') || "Bearer ");
   const [participantInfoAtom, setParticipantAtom] = useRecoilState(participantInfo);
   const adminInfoState = useRecoilValue<AdminInfo>(adminInfo);
   const [currentProblem, setCurrentProblem] = useState(0);
   const [noOfProblems, setNoOfProblems] = useState(0);
   const currentRoomJoinedState = useRecoilValue(currentRoomJoined);

   useEffect(() => {
      // check if there is a cookie
      if (!Cookies.get('token')) {
         navigate('/signin')
      }

      socket.on("participantProblem", ({ problem, roomId, status, noOfProblems, currentProblem }: {
         problem: ParticipantProblem,
         roomId: string,
         status: string,
         noOfProblems: number,
         currentProblem: number,
         index: number
      }) => {
         setProblem(problem);
         setStatus(status);
         setRoomId(roomId);
         setCurrentProblem(currentProblem);
         setNoOfProblems(noOfProblems);
      })

      socket.on("end", ({ leaderboard, status }: {
         leaderboard: Participant[],
         status: string
      }) => {
         setLeaderboard(leaderboard);
         setStatus(status);
      })

      socket.on("leaderboard", ({ leaderboard, status }: {
         leaderboard: Participant[],
         status: string
      }) => {
         setLeaderboard(leaderboard);
         setStatus(status);
      })

      socket.on("participants", (participants: Participant[]) => {
         setPartcipants(participants);
      })

      socket.on("noOfProblems", ({ noOfProblems }: {
         noOfProblems: number
      }) => {
         setNoOfProblems(noOfProblems);
      })

      socket.emit("NoOfProblems", ({ roomId: currentRoomJoinedState.roomId, quizId: currentRoomJoinedState.quizId }), (problemsLength: number) => {
         setNoOfProblems(problemsLength);
      })
      return () => {
         socket.off("NoOfProblems")
      }
   }, [socket, navigate, setParticipantAtom, roomId, currentRoomJoinedState]);

   if (status === "FINISHED") {
      return <div>
         <EndRoom leaderboard={leaderboard} />
         <div className="flex justify-end mt-20 pe-[560px]">
            <button className="bg-gray-900 hover:bg-gray-800 px-8 py-3 text-white rounded-md"
               onClick={() => {
                  socket.emit("leaveRoom", {
                     roomId: currentRoomJoinedState.roomId
                  });
                  localStorage.removeItem("currentRoomJoined");
                  navigate("/findRoom");
               }}
            >Exit</button>
         </div>
      </div>
   }

   if (status === "WAITING") {
      if (userInfo.id === "") {
         participants.map((participant: Participant) => {
            if (participant.username === adminInfoState.username) {
               setUserInfo(participant);
               return;
            }
         })
      }

      return <WaitingPage
         user={userInfo}
         participants={participants.filter((participant: Participant) => {
            return participant.username !== adminInfoState.username
         })}
         noOfProblems={noOfProblems || 0}
      />
   }

   if (status === "LEADERBOARD") {
      return <div>
         <Leaderboard leaderboard={leaderboard} />
      </div>
   }

   return <Quizes
      quizId={currentRoomJoinedState.quizId}
      pointsId={currentRoomJoinedState.pointsId}
      problem={problem}
      roomId={currentRoomJoinedState.roomId}
      socket={socket}
      noOfProblems={noOfProblems}
      currentProblem={currentProblem}
   />
}
