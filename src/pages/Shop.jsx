import React from 'react'
import Banner from '../assests/main-banner.jpg'
import efCard from '../reducers/cartReducers'

const Shop = () => {
  return (
    <div>
      {/* <div className="min-h-[90vh] px-4 sm:px-8 md:px-20 bg-[#F2F0F1]">
        <img src={Banner} alt="" className='' />
      </div> */}
      <div className=" px-4 sm:px-8 md:px-20 py-4">
        <div className="flex py-4 gap-2">
          <div className="bg-[#F2F0F1] text-center py-2 block rounded-lg w-full sm:w-[150px]"> <i className="px-1 fa-solid fa-sort text-[#00000081]"></i>Sort</div>
          <div className="bg-[#F2F0F1] text-center py-2 block rounded-lg w-full sm:w-[150px]"> <i className="px-1 fa-solid fa-filter text-[#00000081]"></i>Filter</div>
        </div>
        <div className="flex justify-between py-4">
          {
            efCard.map((card) => (
              <div className="g-[#F2F0F1] w-[40%] sm:w-[30%] md:w-[300px] rounded-b-xl" key={card.id}>
                <img src={card.img} alt="" />
                <div className="px-1 py-1 block">
                  <div className="flex items-center">
                    <div className="text-[30px] font-bold pr-2">{card.price}</div> For: 
                    <div className="text-[#00000081] px-2">{card.tradeType}</div>
                    <div className="text-[10px] bg-red-200 font-bold rounded-full text-red-500 px-2 py-[1px]">{card.isAvailable ? '' : 'SOLD'}</div>
                  </div>
                  <div className="text-[18px]">
                    {card.shortDesc}
                  </div>
                  <div className="text-[#00000081] text-[10px]">{card.uploadDate}</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

export default Shop
