import React from 'react'
import Banner from '../assests/messi-banner.png'
import { Link } from 'react-router-dom'

const Home = () => {
    return (
        <div className=' min-h-[100vh]'>
            <div className="min-h-[90vh] py-4 px-4 sm:px-8 md:px-20 bg-[#F2F0F1] banner block sm:flex justify-between items-center">
                <div className="sm:w-[50%]">
                    <div className="">
                        {/* <div className=" font-bold text-[40px] sm:text-[60px]">
                            Biggest eFootball account marketplace <br />
                        </div> */}
                        <div className="font-[900] text-[40px] sm:text-[60px] leading-[1.1]">
                            Buy, Sell, or Exchange eFootball Accounts — Dominate the pitch!
                        </div>
                        <p>Unlock top-tier teams or trade your way to victory. Join the marketplace for premium accounts and exclusive deals!</p>
                        <Link className='bg-black text-white rounded-full w-full sm:w-[210px] text-center py-3 my-3 block'>
                            Start trading
                        </Link>
                    </div>
                </div>
                <img src={Banner} alt="" />
            </div>
        </div>
    )
}

export default Home