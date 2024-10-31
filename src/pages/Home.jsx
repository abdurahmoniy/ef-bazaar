import React from 'react'
import MainBanner from '../assests/main-banner.jpg'
import Banner from '../assests/messi-banner.png'
import { Link } from 'react-router-dom'
import './style.css'
import CopyBox from '../components/CopyBox'

const Home = () => {
    return (
        <div className=' min-h-[100vh]'>
            <div className="min-h-[90vh] py-4 px-4 sm:px-8 md:px-20 bg-[#F2F0F1] banner block md:flex justify-between items-center">
                <div className="md:w-[50%]">
                    <div className="">
                        {/* <div className=" font-bold text-[40px] sm:text-[60px]">
                            Biggest eFootball account marketplace <br />
                        </div> */}
                        <div className="font-[900] text-[40px] sm:text-[60px] leading-[1.1]">
                            Buy, Sell or Exchange eFootball Accounts — Dominate the pitch!
                        </div>
                        <p className='py-4'>Unlock top-tier teams or trade your way to victory. Join the marketplace for premium accounts and exclusive deals!</p>
                        <Link to='/shop' className='btn bg-black text-white rounded-full w-full sm:w-[210px] text-center py-3 my-3 block'>
                            Shop now !
                        </Link>
                        <Link to='/placead' className='btn bg-black text-white rounded-full w-full sm:w-[210px] text-center py-3 my-3 block'>
                            Place an AD
                        </Link>
                    </div>
                </div>
                <img src={Banner} alt="" />
            </div>
            <div className="pitchbg py-4 text-white text-center text-[32px] sm:text-[46px] font-bold">THE PITCH IS OURS!</div>
        </div>
    )
}

export default Home