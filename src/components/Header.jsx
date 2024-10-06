import React from 'react'
import LogoDark from '../assests/logo light.png'
import LogoLight from '../assests/logo dark.png'
import navLinks from '../reducers/navLinkReducers'
import { Link } from 'react-router-dom'
import CartImg from '../assests/cart.png'

const Header = () => {
  return (
    <div className='header md:px-20 border w-full flex justify-between items-center'>
      <Link to='/' className="logo-light inline-block">
        <img className='h-16 my-2' src={LogoLight} alt="" />
      </Link>
      <div className="logo-dark hidden">
        <img className='h-16 my-2' src={LogoDark} alt="" />
      </div>
      <nav className='nav flex'>
        <ul className="flex space-x-4 mr-8">
          {navLinks.map((link, index) => (
            <li key={index}>
              <Link to={link.path} className=" hover:text-blue-700">
                {link.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link to='/cart'><img src={CartImg} alt="" /></Link>
      </nav>
    </div>
  )
}

export default Header
