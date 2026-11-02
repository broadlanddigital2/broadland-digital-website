var designNowButton = document.getElementById("design-button");
var wcProductsLoop = document.getElementById('woo_products_loop');
var selectManufacturer = document.getElementById("selectManufacturer");
var selectModel = document.getElementById("selectModel");
var moreInfoBtn = document.getElementById("moreInfoBtn");
var productPrice = document.getElementById("productPrice");
var selectGraphics = document.getElementById("selectGraphics");
var continueBtn = document.getElementById("continueBtn");

window.onload = function() {
  var $ = jQuery;
}

if (designNowButton) {
    designNowButton.addEventListener("click",function(e){
        console.warn('wc');
        if (wcProductsLoop){
            wcProductsLoop.classList.toggle('open')
        }
    },false);
}



if (selectManufacturer) {
		selectManufacturer.onchange = function () {
		// 		selectModel.options = "";
		jQuery('#productPrice').html("0.00");
		selectedManufacturer = this.options[this.selectedIndex].text;
		jQuery.ajax({
            type: "POST",
			url: "/wp-admin/admin-ajax.php",
            data: {action: 'get_wc_products', category: selectedManufacturer},
            success: function (data) {
				console.log(data)
                jQuery('#selectModel').html(data);
            }
        });
						
		selectModel.classList.add('active');
	}
}

if (selectModel && moreInfoBtn) {
	selectModel.onchange = function () {
		console.log(this.options[this.selectedIndex].getAttribute("data-price"));
		moreInfoBtn.classList.remove('disabled');
		moreInfoBtn.href = this.options[this.selectedIndex].getAttribute("data-url");
		productPrice.innerHTML = this.options[this.selectedIndex].getAttribute("data-price");
		var productID = this.options[this.selectedIndex].getAttribute("data-model-id");
		jQuery.ajax({
            type: "POST",
			url: "/wp-admin/admin-ajax.php",
            data: {action: 'get_wc_product_attributes', product_id: productID},
            success: function (data) {
				console.log(data)
                jQuery('#selectGraphics').html(data);
            }
        });
		selectGraphics.classList.add('active');
	}
}

if (selectGraphics && moreInfoBtn) {
	selectGraphics.onchange = function () {
		productPrice.innerHTML = this.options[this.selectedIndex].getAttribute("data-price");
		continueBtn.classList.add('active');
	}
}

var swiper =  document.getElementById('swiper');

document.addEventListener('DOMContentLoaded', function(e) {
	if (swiper) {
		//init swiper
		const swiper = new Swiper('.swiper', {
			// Optional parameters
			loop: true,
			slidesPerView: 1,
			spaceBetween: 10,
		
			// Navigation arrows
			navigation: {
				nextEl: '.swiper-button-next',
				prevEl: '.swiper-button-prev',
			},

			breakpoints: {
				// when window width is >= 768px
				768: {
					slidesPerView: 5,
					spaceBetween: 10
				},
			}
		});

		//grab images for gallery
		var bannerImage = document.querySelector('.banner-image img');
		var images = document.querySelectorAll('.swiper-slide img');

		images.forEach(image => {
			image.addEventListener('click', () => {
				bannerImage.srcset = image.src;
			})
		})
	}

	const sections = document.querySelectorAll('.category-section');
	sectionCats = [];

	sections.forEach(section => {
		var currentSection = '0';
		const btns = section.querySelectorAll('.site-btn');
		btns[currentSection].classList.add('active');
		
		section.querySelectorAll('.subcat').forEach(subCat => {
			if(subCat.classList[1] !== currentSection) {
				subCat.style.display = 'none';
			}
		})

		//currentSection in section classList array looked at index 1 in DOM element

		btns.forEach(btn => {			
			btn.addEventListener('click', () => {
				btns.forEach(btn => {
					btn.classList.remove('active');
				})
				btn.classList.add('active');
				currentSection = btn.classList[1];
				section.querySelectorAll('.subcat').forEach(subCat => {
					subCat.style.display = 'block';
					if(subCat.classList[1] !== currentSection) {
						subCat.style.display = 'none';
					}
				})
			});
		})

	});

});