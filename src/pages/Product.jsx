import React from 'react';
import { useParams } from 'react-router-dom';

const Product = ({ efCard }) => {
    const { id } = useParams();
    const product = efCard.find((item) => item.id === parseInt(id));

    if (!product) {
        return <div>Product not found.</div>;
    }

    return (
        <div>
            <div className=" px-4 sm:px-8 md:px-20 py-4 flex">
                <div className="img-box w-[50%] px-4">
                    <img src={product.productImages[0].image} alt="" />
                </div>
                <div className="details w-[50%] px-4 block">
                    <div className="text-[28px] font-bold">{product.shortDesc}</div>
                    {product.isAvailable ? '' :
                        <div className="text-[14px] w-[80px] text-center bg-red-200 font-bold
                            rounded-full text-red-500 px-2 py-[1px] my-2">
                            <i className='fa-solid fa-warning'></i> SOLD
                        </div>
                    }
                    <div className="text-[32px]">{product.price}</div>
                    <div className="my-2">
                        <div className="text-[14px] flex">For: <div className="text-gray-600 px-2">
                            {product.tradeType}
                        </div> </div>
                        <div className="text-[14px] flex">Features: <div className="text-gray-600 px-2">
                            {product.longDesc}
                        </div> </div>
                        <div className="text-[14px] flex">Post Date: <div className="text-gray-600 px-2">
                            {product.uploadDate}
                        </div> </div>
                    </div>
                    <div className="cursor-pointer">Get in touch with owner <i className='fa-solid fa-pointer'></i></div>
                </div>
            </div>
            {/* 
      <p></p>
      <p>Price: </p>
      <p>Trade Type: </p> */}
        </div>
    );
};

export default Product;
