import React, { useState } from 'react'
import LogoDark from '../assests/logo light.png'
import LogoLight from '../assests/logo dark.png'
import navLinks from '../reducers/navLinkReducers'
import { Link } from 'react-router-dom'
import CartImg from '../assests/cart.png'
import Bars from '../assests/bars.png'
import './style.css'

const Header = () => {
  const [toggle, setToggle] = useState(false);

  const toggleMenu = () => setToggle((prev) => !prev);
  return (
    <div className=' header px-4 sm:px-8 md:px-20 w-full flex justify-between items-center py-4'>
      <div className="block lg:hidden ">
        <i
          className={`${toggle ? "fas fa-x" : "fas fa-bars"
            } object-contain`}
          onClick={toggleMenu}
        ></i>
        <div
          className={`${!toggle ? "" : "active"} mobile-menu shadow-lg`}
        >
          <ul className="block sm:hidden p-8 ">
            {navLinks.map((nav, idx) => (
              <Link
                to={nav.path}
                key={nav.idx}
                className={`block my-4 hover:text-blue-500`}>
                  <i className={`${nav.icon} pr-2 text-gray-600`}></i>
                {nav.name}
              </Link>
            ))}
          </ul>
        </div>
      </div>
      <Link to='/' className="logo-light inline-block">
        <img className='h-16 my-2' src={LogoLight} alt="" />
      </Link>
      <div className="logo-dark hidden">
        <img className='h-16 my-2' src={LogoDark} alt="" />
      </div>
      <nav className='nav hidden lg:flex'>
        <ul className="flex space-x-7">
          {navLinks.map((link, index) => (
            <li className='nav-item' key={index}>
              <Link to={link.path} className="">
                {link.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Link className='cart-item mr-4' to='/cart'><img src={CartImg} alt="" /></Link>
    </div>
  )
}

export default Header
