import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

const Product = ({ efCard }) => {
    const { id } = useParams();
    const product = efCard.find((item) => item.id === parseInt(id));
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [isFullScreen, setIsFullScreen] = useState(false);

    if (!product) {
        return <div>Product not found.</div>;
    }

    const showNextImage = () => {
        setSelectedImageIndex((prevIndex) => (prevIndex + 1) % product.productImages.length);
    };

    const showPreviousImage = () => {
        setSelectedImageIndex((prevIndex) =>
            (prevIndex - 1 + product.productImages.length) % product.productImages.length
        );
    };

    const toggleFullScreen = () => {
        setIsFullScreen(!isFullScreen);
    };

    return (
        <div className="p-4 sm:p-8 md:p-12">
            <div className="block lg:flex lg:space-x-8">
                {/* Image Gallery */}
                <div className="img-box lg:w-1/2 relative flex">
                    <img
                        className="px-2 w-full rounded-lg cursor-pointer object-contain"
                        src={product.productImages[selectedImageIndex].image}
                        alt={`Product ${selectedImageIndex + 1}`}
                        onClick={toggleFullScreen}
                    />
                    <button
                        onClick={showPreviousImage}
                        className="absolute top-1/2 left-0 transform -translate-y-1/2 text-white bg-gray-700 bg-opacity-50 px-3 py-1 rounded-full"
                    >
                        <i class="fa-solid fa-caret-left"></i>
                    </button>
                    <button
                        onClick={showNextImage}
                        className="absolute top-1/2 right-0 transform -translate-y-1/2 text-white bg-gray-700 bg-opacity-50 px-3 py-1 rounded-full"
                    >
                        <i class="fa-solid fa-caret-right"></i>
                    </button>
                </div>

                {/* Product Details */}
                <div className="details lg:w-1/2 px-4">
                    <div className="text-[28px] font-bold">{product.shortDesc}</div>
                    {!product.isAvailable && (
                        <div className="text-[14px] w-[80px] text-center bg-red-200 font-bold rounded-full text-red-500 px-2 py-1 my-2">
                            <i className="fa-solid fa-warning"></i> SOLD
                        </div>
                    )}
                    <div className="text-[32px] my-4">{product.price}</div>
                    <div className="my-2 space-y-1">
                        <div className="text-[14px] flex">For: <span className="text-gray-600 pl-2">{product.tradeType}</span></div>
                        <div className="text-[14px] flex">Features: <span className="text-gray-600 pl-2">{product.longDesc}</span></div>
                        <div className="text-[14px] flex">Post Date: <span className="text-gray-600 pl-2">{product.uploadDate}</span></div>
                    </div>
                    <div className="cursor-pointer text-blue-500 hover:text-blue-700">
                        Get in touch with owner <i className="fa-solid fa-pointer"></i>
                    </div>
                </div>
            </div>

            {/* Full-Screen Image Modal */}
            {isFullScreen && (
                <div className="fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50" onClick={toggleFullScreen}>
                    <button
                        className="absolute top-4 right-4 text-white text-2xl font-bold"
                        onClick={toggleFullScreen}
                    >
                        &times;
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); showPreviousImage(); }}
                        className="absolute top-1/2 left-4 transform -translate-y-1/2 text-white bg-gray-700 bg-opacity-50 px-3 py-1 rounded-full"
                    >
                        <i class="fa-solid fa-caret-left"></i>
                    </button>
                    <img
                        src={product.productImages[selectedImageIndex].image}
                        alt="Full screen"
                        className="max-w-full max-h-full rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); showNextImage(); }}
                        className="absolute top-1/2 right-4 transform -translate-y-1/2 text-white bg-gray-700 bg-opacity-50 px-3 py-1 rounded-full"
                    >
                        <i class="fa-solid fa-caret-right"></i>
                    </button>
                </div>
            )}
        </div>
    );
};

export default Product;
