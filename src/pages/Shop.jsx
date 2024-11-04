import React, { useState } from 'react';
import Banner from '../assests/main-banner.jpg';
import efCard from '../reducers/cartReducers';
import { Link } from 'react-router-dom';

const Shop = () => {
  const [sortOption, setSortOption] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [activeModal, setActiveModal] = useState(null);

  const sortedProducts = [...efCard].sort((a, b) => {
    if (sortOption === 'price-asc') return parseFloat(a.price) - parseFloat(b.price);
    if (sortOption === 'price-desc') return parseFloat(b.price) - parseFloat(a.price);
    return 0;
  });

  const filteredProducts = sortedProducts.filter((product) => {
    const matchesTrade = tradeFilter ? product.tradeType.includes(tradeFilter) : true;
    const matchesAvailability = availabilityFilter
      ? availabilityFilter === 'available' ? product.isAvailable : !product.isAvailable
      : true;
    return matchesTrade && matchesAvailability;
  });

  return (
    <div>
      <div className="px-4 sm:px-8 md:px-20 bg-[#F2F0F1]">
        <img src={Banner} alt="Main Banner" className="w-full h-auto object-cover" />
      </div>

      <div className="px-4 sm:px-8 md:px-20 py-4">
        <div className="flex py-4 gap-2 relative">
          <button
            onClick={() => setActiveModal(activeModal === 'sort' ? null : 'sort')}
            className="bg-[#F2F0F1] text-center py-2 block rounded-lg w-full sm:w-[150px] hover:bg-gray-300 transition"
          >
            <i className="px-1 fa-solid fa-sort text-[#00000081]"></i>Sort
          </button>

          <button
            onClick={() => setActiveModal(activeModal === 'filter' ? null : 'filter')}
            className="bg-[#F2F0F1] text-center py-2 block rounded-lg w-full sm:w-[150px] hover:bg-gray-300 transition"
          >
            <i className="px-1 fa-solid fa-filter text-[#00000081]"></i>Filter
          </button>

          {activeModal === 'sort' && (
            <div className="absolute top-[100%] mt-2 bg-[#F2F0F1] w-full sm:w-[300px] p-4 rounded-lg shadow-2xl">
              <div className="flex justify-between items-center">
                <div className="font-semibold mb-2 text-[20px] py-1">Sort</div>
                <div className="bg-red-300 transition hover:scale-105 text-gray-700 font-semibold rounded-md px-2 py-1 cursor-pointer" onClick={() => {
                  setSortOption('');
                }}>Clear</div>
              </div>
              <div onClick={() => setSortOption('price-asc')} className="block mb-1 cursor-pointer">Price: Low to High</div>
              <div onClick={() => setSortOption('price-desc')} className="block cursor-pointer">Price: High to Low</div>
            </div>
          )}

          {activeModal === 'filter' && (
            <div className="absolute top-[100%] mt-2 bg-[#F2F0F1] w-full sm:w-[300px] p-4 rounded-lg shadow-lg">
              <div className="flex justify-between items-center">
                <div className="font-semibold mb-2 text-[20px] py-1">Filter</div>
                <div className="bg-red-300 transition hover:scale-105 text-gray-700 font-semibold rounded-md px-2 py-1 cursor-pointer" onClick={() => {
                  setTradeFilter('');
                  setAvailabilityFilter('');
                }}>Clear</div>
              </div>
              <div className="mb-3">
                <h4 className="font-medium mb-1">Trade Type</h4>
                <label className="block">
                  <input
                    type="radio"
                    name="tradeType"
                    value="Sell"
                    onChange={() => setTradeFilter('Sell')}
                    checked={tradeFilter === 'Sell'}
                    className="mr-2"
                  />
                  Sell
                </label>
                <label className="block">
                  <input
                    type="radio"
                    name="tradeType"
                    value="Exchange"
                    onChange={() => setTradeFilter('Exchange')}
                    checked={tradeFilter === 'Exchange'}
                    className="mr-2"
                  />
                  Exchange
                </label>
              </div>

              <div>
                <h4 className="font-medium mb-1">Availability</h4>
                <label className="block">
                  <input
                    type="radio"
                    name="availability"
                    value="available"
                    onChange={() => setAvailabilityFilter('available')}
                    checked={availabilityFilter === 'available'}
                    className="mr-2"
                  />
                  Available
                </label>
                <label className="block">
                  <input
                    type="radio"
                    name="availability"
                    value="sold"
                    onChange={() => setAvailabilityFilter('sold')}
                    checked={availabilityFilter === 'sold'}
                    className="mr-2"
                  />
                  Sold
                </label>
              </div>
            </div>
          )}

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 py-4">
          {filteredProducts.map((card) => (
            <Link to={`/product/${card.id}`} className="bg-[#F2F0F1] rounded-xl overflow-hidden" key={card.id}>
              <img src={card.productImages[0].image} alt="Product Image" className="w-full h-auto object-cover rounded-t-xl" />
              <div className="px-2 py-2">
                <div className="flex items-center">
                  <div className="text-[30px] font-bold pr-2">{card.price} {card.currency}</div> For:
                  <div className="text-[#00000081] px-2">{card.tradeType}</div>
                  {!card.isAvailable && (
                    <div className="text-[10px] bg-red-200 font-bold rounded-full text-red-500 px-2 py-[1px] ml-2">
                      SOLD
                    </div>
                  )}
                </div>
                <div className="text-[18px] font-medium my-1">{card.shortDesc}</div>
                <div className="text-[#00000081] text-[10px]">{card.uploadDate}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Shop;
