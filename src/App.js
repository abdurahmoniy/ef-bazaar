import { Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import Cart from './pages/Cart';
import Header from './components/Header';
import Footer from './components/Footer';
import Shop from './pages/Shop';
import Placead from './pages/Placead';
import Support from './pages/Support';

function App() {
  return (
    <div className="">
      <Header/>
      <div className=''>
        <Routes>
          <Route element={<Home/>} path='/'/>
          <Route element={<Shop/>} path='/shop'/>
          <Route element={<Placead/>} path='/placead'/>
          <Route element={<Support/>} path='/support'/>
          <Route element={<Cart/>} path='/cart'/>
        </Routes>
      </div>
      <Footer/>
    </div>
  );
}

export default App;
