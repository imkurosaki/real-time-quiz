import { PointsUserCard } from "./Leaderboard"
import { Participant } from "./WaitingPage"

export default function EndRoom({ leaderboard }: {
   leaderboard: Participant[],
}) {

   return <div className="flex justify-center pt-16">
      <div>
         <div className="ps-28">
            <p className="text-sm text-gray-500">The quiz is ended</p>
            <p className="text-5xl mb-12">Leaderboard Results</p>
         </div>
         <div className="flex flex-col gap-3">
            {leaderboard.map((element: any, key: number) => {
               return <div key={key} className="flex items-center">
                  <PointsUserCard key={key} id={element.participant.id} username={element.participant.username} points={element.points} image={element.participant.image.toString()} />
                  {key === 0 ?
                     <img src={new URL(`../../assets/gold-medal.png`, import.meta.url).href} alt=""
                        className="w-12 ms-2 shake-left-right"
                     />
                     : <p></p>}
               </div>
            })}
         </div>
      </div>
   </div>
}
