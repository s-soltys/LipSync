package lipsync.core.lpc
{
	/**
	 * ...
	 * @author S
	 */
	public class LP
	{
		public static var order:int = 9;
		
		private static function createWindow(length:int):Vector.<Number> {
			var w:Vector.<Number> = new Vector.<Number>();
			
			for (var n:int = 0; n < length; n++) {
				var x:Number = 0.0;
				
				var arg:Number = (2 * Math.PI * n) / (length - 1);
				x = 0.54 - 0.46 * Math.cos( arg ); // hamming
				//x = 0.5 * (1 + Math.cos(arg)); // hanning
				//x = 0.42 - 0.5 * Math.cos(arg) + 0.08 * Math.cos(2 * arg); // blackman
				//x = 0.35875 - 0.48829*Math.cos(arg) + 0.14128*Math.cos(2*arg) + 0.01168*Math.cos(3*arg); // blackman-harris
				
				w.push(x);
			}
			
			return w;
		}
		
		private static function computeAutocorrelation(x:Vector.<Number>):Vector.<Number> {
			var dl:Vector.<Number> = new Vector.<Number>();
			var Rt:Vector.<Number> = new Vector.<Number>();
			var R:Vector.<Number> = new Vector.<Number>();
			var r1:Number, r2:Number, r1t:Number;
			var L:int = x.length;
			var lambda:Number = 0.0;
			var P:int = order;
			
			for (var z:int = 0; z < L; z++) {
				dl.push(0.0);
				Rt.push(0.0);
			}
			
			R[0] = Rt[0] = 0;
			r1 = r2 = r1t = 0;
			
			for (var k:int = 0; k < L; k++) {
					Rt[0] += (Number)(x[k]) * (Number)(x[k]);
					dl[k] = r1 - (Number)(lambda) * (Number)(x[k] - r2);
					r1 = x[k];
					r2 = dl[k];
			}
			for (var i:int = 1; i <= P; i++) {
				Rt[i] = 0;
				r1 = r2 = 0;
				for(k=0; k<L;k++) {
					Rt[i]+=(Number)(dl[k])*(Number)(x[k]);
					r1t = dl[k];
					dl[k] = r1 - (Number)(lambda) * (Number)(r1t - r2);
					r1 = r1t;
					r2 = dl[k];
				}
			}

			for (i = 0; i <= P; i++)
				R[i] = (Number)(Rt[i]);
				
			return R;
		}
		
		private static function computeCoef(R:Vector.<Number>):Vector.<Number> {
			var km:Number, Em1:Number, Em:Number;
			var k:int, s:int, m:int;
			
			var A:Vector.<Number> = new Vector.<Number>();
			var Am:Vector.<Number> = new Vector.<Number>();
			var K:Vector.<Number> = new Vector.<Number>();
			
			for (var j:int = 0; j <= order; j++) {
				K.push(0.0);
				A.push(0.0);
				Am.push(0.0);
			}
			
			Em1 = R[0];
			A[0] = Am[0] = 1;
			km = 0;
			
			for (m = 1; m <= order; m++) {
				var err:Number = 0.0;
				
				for (k = 1; k <= m - 1; k++) {
					err += Am[k] * R[m - k];
				}
				
				km = (R[m] - err) / Em1;
				K[m - 1] = -(Number)(km);
				A[m] = km;
				
				for (k = 1; k <= m - 1; k++) {
					A[k] = (Number)(Am[k] - km * Am[m - k]);
				}
				
				Em = (1 - km * km) * Em1;
				
				for (s = 0; s <= order; s++) {
					Am[s] = A[s];
				}
				
				Em1 = Em;
			}
			
			return K;
		}
		
		public static function analyze(samples:Vector.<Number>):Vector.<Number> {
			var R:Vector.<Number> = computeAutocorrelation(samples);
			var output:Vector.<Number> = computeCoef(R);
			
			// NORMALISATION
			//for (var i:int = 0; i < output.length; i++) output[i] = (output[i] + 1) / 2;
			
			output.pop();
			
			return output;
		}
		
	}

}