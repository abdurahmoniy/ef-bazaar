import React from 'react'
import './style.css'
import Logo from '../assests/logo dark.png'
import { Link } from 'react-router-dom'

const Footer = () => {
    return (
        <div className='bg-[#F2F0F1] flex justify-around px-4 sm:px-8 md:px-20 py-8 border'>
            <div className="">
                <Link to='/' className="logo-light inline-block">
                    <img className='h-16 my-2' src={Logo} alt="" />
                </Link>
                <p>You can buy or sell your eFootball account </p>
            </div>
            <div className="block cursor-pointer">
                <div className=" font-bold text-[20px] pb-2">COMPANY</div>
                <div className="">Home</div>
                <div className="">About</div>
                <div className="">Works</div>
                <div className="">Career</div>
            </div>
            <div className="block cursor-pointer">
                <div className=" font-bold text-[20px] pb-2">HELP</div>
                <div className="">Customer Support</div>
                <div className="">Delivery Details</div>
                <div className="">Terms & Conditions</div>
                <div className="">Privacy Policy</div>
            </div>
            <div className="block cursor-pointer">
                <div className=" font-bold text-[20px] pb-2">FAQ</div>
                <div className="">Account</div>
                <div className="">Manage Deliveries</div>
                <div className="">Orders</div>
                <div className="">Payments</div>
            </div>
            <div className="block cursor-pointer">
                <div className=" font-bold text-[20px] pb-2">RESOURCES</div>
                <div className="">Free eBooks</div>
                <div className="">Development Tutorial</div>
                <div className="">How to - Blog</div>
                <div className="">Youtube Playlist</div>
            </div>
        </div>
    )
}

export default Footer
