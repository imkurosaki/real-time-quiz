import { useNavigate } from "react-router-dom";
import { useRecoilValue } from "recoil";
import { useRef } from "react";
import { userInfoAtom } from "../../store/user.ts";
import DropDownProfile from "./DropDownProfile";
import Title from "./Title.tsx";

export default function Navbar() {
   const navigate = useNavigate();
   const userInfoState = useRecoilValue(userInfoAtom);
   const flagRoom = useRef<boolean>(false);

   return <div className="flex bg-bgColor/30 backdrop-blur-sm fixed w-full top-0 shadow-md z-50 justify-between items-center px-20 py-3 border-b border-b-gray-700">
      <Title />
      <div className="flex gap-10">
         {flagRoom.current === false
            ?
            <button className="bg-blue-600 hover:bg-blue-700 font-medium text-white border border-gray-700 px-8 py-3 rounded-md shadow-lg transform active:scale-75 transition-transform"
               onClick={() => {
                  flagRoom.current = true;
                  navigate("/findRoom")
               }}
            >
               Find Room
            </button>
            :
            <button className="bg-blue-600 hover:bg-blue-700 font-medium text-white border border-gray-700 px-8 py-3 rounded-md shadow-lg transform active:scale-75 transition-transform"
               onClick={() => {
                  flagRoom.current = false;
                  navigate("/room")
               }}
            >
               Add Room
            </button>
         }
         <DropDownProfile image={userInfoState.image.toString()} email={userInfoState.email} />
      </div>
   </div>
}
