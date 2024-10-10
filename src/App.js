import { Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import Cart from './pages/Cart';
import Header from './components/Header';
import Footer from './components/Footer';

function App() {
  return (
    <div className="">
      <Header/>
      <div className=''>
        <Routes>
          <Route element={<Home/>} path='/'/>
          <Route element={<Cart/>} path='/cart'/>
        </Routes>
      </div>
      <Footer/>
    </div>
  );
}

export default App;
