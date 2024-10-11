import React from 'react'
import Banner from '../assests/messi-banner.png'

const Home = () => {
    return (
        <div className=' min-h-[30vh]'>
            <div className="bg-[#F2F0F1] banner">
                <img src={Banner} alt="" />
            </div>
        </div>
    )
}

export default Home