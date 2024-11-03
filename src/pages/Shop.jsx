import React, { useState } from 'react';
import Banner from '../assests/main-banner.jpg';
import efCard from '../reducers/cartReducers';
import { Link } from 'react-router-dom';

const Shop = () => {
  const [sortOption, setSortOption] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [activeModal, setActiveModal] = useState(null);

  // Sorting products
  const sortedProducts = [...efCard].sort((a, b) => {
    if (sortOption === 'price-asc') return parseFloat(a.price) - parseFloat(b.price);
    if (sortOption === 'price-desc') return parseFloat(b.price) - parseFloat(a.price);
    return 0;
  });

  // Filtering products
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
          {/* Sort Button */}
          <button
            onClick={() => setActiveModal(activeModal === 'sort' ? null : 'sort')}
            className="bg-[#F2F0F1] text-center py-2 block rounded-lg w-full sm:w-[150px] hover:bg-gray-300 transition"
          >
            <i className="px-1 fa-solid fa-sort text-[#00000081]"></i>Sort
          </button>

          {/* Filter Button */}
          <button
            onClick={() => setActiveModal(activeModal === 'filter' ? null : 'filter')}
            className="bg-[#F2F0F1] text-center py-2 block rounded-lg w-full sm:w-[150px] hover:bg-gray-300 transition"
          >
            <i className="px-1 fa-solid fa-filter text-[#00000081]"></i>Filter
          </button>

          {/* Sort Modal */}
          {activeModal === 'sort' && (
            <div className="absolute top-[100%] mt-2 bg-white w-full sm:w-[150px] p-4 rounded-lg shadow-2xl border">
              <h3 className="font-semibold mb-2">Sort By:</h3>
              <div onClick={() => setSortOption('price-asc')} className="block mb-1">Price: Low to High</div>
              <div onClick={() => setSortOption('price-desc')} className="block">Price: High to Low</div>
            </div>
          )}

          {/* Filter Modal */}
          {activeModal === 'filter' && (
            <div className="absolute top-[100%] mt-2 bg-white w-full sm:w-[150px] p-4 rounded-lg shadow-2xl border">
              <h3 className="font-semibold mb-2">Filter By:</h3>
              <div>
                <h4 className="font-medium">Trade Type</h4>
                <div onClick={() => setTradeFilter('Sell')} className="block mb-1">Sell</div>
                <div onClick={() => setTradeFilter('Exchange')} className="block">Exchange</div>
              </div>
              <div className="mt-2">
                <h4 className="font-medium">Availability</h4>
                <div onClick={() => setAvailabilityFilter('available')} className="block mb-1">Available</div>
                <div onClick={() => setAvailabilityFilter('sold')} className="block">Sold</div>
              </div>
            </div>
          )}
        </div>

        {/* Product Cards */}
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
