import React from 'react'
import './style.css'
import Logo from '../assests/logo dark.png'
import { Link } from 'react-router-dom'

const Footer = () => {
    return (
        <div className="bg-[#F2F0F1] px-4 sm:px-8 md:px-20 py-8 border">

            <div className='sm:flex justify-between '>
                <div className="">
                    <Link to='/' className="logo-light inline-block">
                        <img className='h-16 my-2' src={Logo} alt="" />
                    </Link>
                    <p>You can buy or sell eFootball account worldwide !</p>
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
            <div className="border-b-2 border-b-[#9e9e9e] my-4"></div>
            <div className="sm:flex justify-between items-center">
                <p>eF-Bazaar © 2024, All rights reserved.</p>
                <div className="flex gap-2 my-4 sm:my-0">
                    <a href='#' className="soc-icon">
                        <i className="fab fa-instagram fa-2x"></i>
                    </a>
                    <a href='#' className="soc-icon">
                        <i className="fab fa-telegram fa-2x"></i>
                    </a>
                    <a href='#' className="soc-icon">
                        <i className="fab fa-twitter fa-2x"></i>
                    </a>
                    <a href='#' className="soc-icon">
                        <i className="fab fa-github fa-2x"></i>
                    </a>
                </div>
            </div>
        </div>
    )
}

export default Footer
